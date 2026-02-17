//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";

// Layout:
// pragma
// imports
// events
// errors
// interfaces
// libraries
// contracts

// Inside contract:
// Type declarations
// State variables
// Events
// Errors
// Modifiers
// Functions

// Function order:
// constructor
// receive / fallback
// external
// public
// internal
// private
// view / pure (same visibility ordering)

// - [ ] Write `Paypink.sol` — article registry (slug, creator, price, contentHash, views, earned) + 99/1 payment split logic
// - [ ] Write unit tests for `Paypink.sol` (`forge test`)
//
// - Register article (slug, creator, price, content hash)
// - Record payment → immediate 99/1 split
// - Track views and earned per article

/**
 * @title Paypink
 * @author Paypink
 * @notice Decentralized pay-per-article platform with a 99/1 creator/platform revenue split.
 * @dev Articles are keyed by `keccak256(slug)`. Payments use a pull-over-push withdrawal pattern.
 */
contract Paypink {
    using SafeERC20 for IERC20;

    /// @notice Metadata and accounting for a single article.
    struct Article {
        string slug;
        address creator;
        /// @dev USD price with 18 decimals (e.g. 5e18 = $5.00). Converted to ETH at pay-time via price feed.
        uint256 price;
        string contentHash;
        uint256 views;
        /// @dev Earned amount in wei (ETH actually received).
        uint256 earned;
    }

    /* ----- STATE VARIABLES ----- */

    /// @notice Deployer of the contract; receives platform fees.
    address public immutable owner;
    address public paymentToken;
    address public authorizedX402Caller;
    /// @notice ETH/USD price feed (AggregatorV3Interface-compatible).
    AggregatorV3Interface public priceFeed;
    /// @notice Maximum acceptable age (in seconds) for price feed data.
    uint256 public maxStaleness = 3600;
    /// @notice Accumulated platform fees available for withdrawal.
    uint256 public ownerBalance;
    mapping(bytes32 slugHash => Article) articles;
    mapping(address creator => bytes32[] slugHashes) creatorArticles;
    /// @notice Whether a reader has already paid for a given article.
    mapping(bytes32 slugHash => mapping(address reader => bool paid)) public hasPaid;
    /// @notice Accumulated earnings available for creator withdrawal.
    mapping(address creator => uint256 balance) public creatorBalances;
    /// @notice Accumulated ERC-20 earnings available for creator withdrawal.
    mapping(address creator => uint256 balance) public creatorTokenBalances;
    /// @notice Accumulated platform ERC-20 fees available for withdrawal.
    uint256 public platformTokenBalance;
    /// @notice Total ERC-20 amount recorded via x402 payments (used for balance verification).
    uint256 public totalRecorded;

    constructor(address _paymentToken, address _priceFeed) {
        if (_priceFeed == address(0)) {
            revert Paypink__InvalidAddress();
        }
        owner = msg.sender;
        paymentToken = _paymentToken;
        priceFeed = AggregatorV3Interface(_priceFeed);
        if (priceFeed.decimals() != 8) {
            revert Paypink__InvalidPriceFeedDecimals();
        }
    }

    /* ----- EVENTS ----- */

    /// @notice Emitted when a reader pays the full price to unlock an article.
    event ArticlePaid(bytes32 indexed key, address indexed reader, uint256 amount);
    /// @notice Emitted when a new article is registered on the platform.
    event ArticleRegistered(bytes32 indexed key, address indexed creator, string slug, uint256 price);
    /// @notice Emitted when someone tips a creator via an article slug.
    event ArticleTipped(bytes32 indexed key, address indexed creator, string slug, uint256 tip);
    /// @notice Emitted when someone tips a creator directly by address.
    event CreatorTipped(address indexed creator, uint256 tip);
    /// @notice Emitted when the authorized x402 caller is updated.
    event AuthorizedX402CallerSet(address indexed oldCaller, address indexed newCaller);
    /// @notice Emitted when an x402 ERC-20 payment is recorded.
    event X402PaymentRecorded(bytes32 indexed key, address indexed reader, uint256 amount);
    /// @notice Emitted when the payment token is updated.
    event PaymentTokenUpdated(address indexed oldToken, address indexed newToken);
    /// @notice Emitted when the price feed address is updated.
    event PriceFeedUpdated(address indexed oldFeed, address indexed newFeed);
    /// @notice Emitted when the max staleness is updated.
    event MaxStalenessUpdated(uint256 oldStaleness, uint256 newStaleness);

    /* ----- ERRORS ----- */

    /// @notice Thrown when a non-owner calls an owner-only function.
    error Paypink__OwnerOnly();
    /// @notice Thrown when registering an article with a slug that already exists.
    error Paypink__SlugTaken();
    /// @notice Thrown when a reader tries to pay for an article they already unlocked.
    error Paypink__AlreadyPaid();
    /// @notice Thrown when referencing a slug that has no registered article.
    error Paypink__ArticleNotFound();
    /// @notice Thrown when withdrawing with a zero balance.
    error Paypink__NothingToWithdraw();
    /// @notice Thrown when an ETH transfer fails during withdrawal.
    error Paypink__Withdraw_FailedToSend();
    /// @notice Thrown when `address(0)` is passed where a valid address is required.
    error Paypink__InvalidAddress();
    /// @notice Thrown when a non-authorized caller calls a restricted function.
    error Paypink__UnauthorizedCaller();
    /// @notice Thrown when the price feed returns stale data.
    error Paypink__StalePrice();
    /// @notice Thrown when the price feed returns a non-positive answer.
    error Paypink__InvalidPrice();
    /// @notice Thrown when `msg.value` is less than the required ETH amount.
    error Paypink__InsufficientPayment(uint256 required, uint256 sent);
    /// @notice Thrown when the price feed does not use 8 decimals.
    error Paypink__InvalidPriceFeedDecimals();
    /// @notice Thrown when maxStaleness is set outside allowed bounds.
    error Paypink__InvalidStaleness();
    /// @notice Thrown when the contract holds insufficient ERC-20 tokens to cover a recorded payment.
    error Paypink__InsufficientTokenBalance();
    /// @notice Thrown when trying to change the payment token while unclaimed balances exist.
    error Paypink__OutstandingTokenBalance();
    /* ----- MODIFIERS ----- */

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert Paypink__OwnerOnly();
        }
        _;
    }

    modifier onlyAuthorizedX402Caller() {
        if (msg.sender != authorizedX402Caller) {
            revert Paypink__UnauthorizedCaller();
        }
        _;
    }

    /* ----- EXTERNAL ----- */

    /// @notice Register a new article on the platform. Free articles (price = 0) are allowed.
    /// @param slug Unique URL-friendly identifier for the article.
    /// @param price USD price with 18 decimals (e.g. 5e18 = $5.00). Converted to ETH at payment time.
    /// @param contentHash IPFS or other content-addressable hash pointing to the article body.
    function registerArticle(string calldata slug, uint256 price, string calldata contentHash) external {
        bytes32 key = keccak256(abi.encodePacked(slug));
        if (articles[key].creator != address(0)) {
            revert Paypink__SlugTaken();
        }
        Article storage article = articles[key];
        article.slug = slug;
        article.creator = msg.sender; // NOTE: could be passed as arg?
        article.price = price;
        article.contentHash = contentHash;
        creatorArticles[msg.sender].push(key);
        emit ArticleRegistered(key, article.creator, article.slug, article.price);
    }

    /// @notice Pay for an article using ETH. The USD price is converted to ETH via the price feed.
    /// @dev Accepts overpayment and refunds the excess. Revenue is split 99/1 (creator/platform)
    ///      using pull-over-push. Free articles (price = 0) do not require payment.
    /// @param slug Unique identifier of the article to unlock.
    function payForArticle(string calldata slug) external payable {
        bytes32 key = keccak256(abi.encodePacked(slug));
        Article storage article = articles[key];
        if (article.creator == address(0)) {
            revert Paypink__ArticleNotFound();
        }
        if (hasPaid[key][msg.sender]) {
            revert Paypink__AlreadyPaid();
        }

        uint256 requiredEth = _getEthAmountForUsd(article.price);

        if (msg.value < requiredEth) {
            revert Paypink__InsufficientPayment(requiredEth, msg.value);
        }

        hasPaid[key][msg.sender] = true;
        article.views += 1;
        article.earned += requiredEth;

        _splitPayment(requiredEth, article.creator);
        emit ArticlePaid(key, msg.sender, requiredEth);

        // Refund excess ETH (non-reverting: if sender can't receive, excess stays in contract)
        uint256 refund = msg.value - requiredEth;
        if (refund > 0) {
            (bool sent,) = msg.sender.call{value: refund}("");
            if (!sent) {
                // Excess goes to platform balance rather than reverting the payment
                ownerBalance += refund;
            }
        }
    }

    /// @notice Tip a creator via an article slug. The tip is split 99/1 (creator/platform).
    /// @param slug Identifier of the article whose creator receives the tip.
    function tipBySlug(string calldata slug) external payable {
        bytes32 key = keccak256(abi.encodePacked(slug));
        Article storage article = articles[key];
        if (article.creator == address(0)) {
            revert Paypink__ArticleNotFound();
        }
        article.earned += msg.value;
        _splitPayment(msg.value, article.creator);
        emit ArticleTipped(key, article.creator, slug, msg.value);
    }

    /// @notice Tip a creator directly by address. The tip is split 99/1 (creator/platform).
    /// @param creator Address of the creator receiving the tip.
    function tipByAddress(address creator) external payable {
        if (creator == address(0)) {
            revert Paypink__InvalidAddress();
        }
        _splitPayment(msg.value, creator);
        emit CreatorTipped(creator, msg.value);
    }

    /// @notice Record an x402 ERC-20 payment. Verifies that real tokens have been settled
    ///         into the contract before crediting balances (defense-in-depth alongside access control).
    /// @param slug Unique identifier of the article.
    /// @param reader Address of the reader who paid via x402.
    /// @param amount ERC-20 amount paid (must be backed by actual tokens in the contract).
    function recordX402Payment(string calldata slug, address reader, uint256 amount) external onlyAuthorizedX402Caller {
        bytes32 key = keccak256(abi.encodePacked(slug));
        Article storage article = articles[key];
        if (article.creator == address(0)) {
            revert Paypink__ArticleNotFound();
        }
        if (hasPaid[key][reader]) {
            revert Paypink__AlreadyPaid();
        }

        // Underflows (reverts) if balanceOf < totalRecorded, which is intentional:
        // it means tokens were removed outside normal withdrawal flows.
        uint256 available = IERC20(paymentToken).balanceOf(address(this)) - totalRecorded;
        if (available < amount) {
            revert Paypink__InsufficientTokenBalance();
        }

        hasPaid[key][reader] = true;
        article.views += 1;
        article.earned += amount;
        totalRecorded += amount;

        _splitTokenPayment(amount, article.creator);

        emit X402PaymentRecorded(key, reader, amount);
    }

    /* ----- INTERNAL ----- */

    /// @dev Split `amount` 99/1 between `creator` and the platform. Rounding favours the creator.
    function _splitPayment(uint256 amount, address creator) internal {
        uint256 platformShare = amount * 1 / 100;
        uint256 creatorShare = amount - platformShare;
        creatorBalances[creator] += creatorShare;
        ownerBalance += platformShare;
    }

    /// @dev Split `amount` 99/1 between `creator` and the platform for ERC-20 token payments.
    function _splitTokenPayment(uint256 amount, address creator) internal {
        uint256 platformShare = amount / 100;
        uint256 creatorShare = amount - platformShare;
        creatorTokenBalances[creator] += creatorShare;
        platformTokenBalance += platformShare;
    }

    /// @dev Convert a USD amount (18 decimals) to ETH (18 decimals) using the price feed.
    ///      Free articles (priceUsd = 0) return 0 without reading the feed.
    function _getEthAmountForUsd(uint256 priceUsd) internal view returns (uint256) {
        if (priceUsd == 0) return 0;

        (, int256 answer,, uint256 updatedAt,) = priceFeed.latestRoundData();
        if (answer <= 0) {
            revert Paypink__InvalidPrice();
        }
        if (block.timestamp - updatedAt > maxStaleness) {
            revert Paypink__StalePrice();
        }

        // price feed returns ETH/USD with 8 decimals (e.g. 2000_00000000 = $2000)
        // priceUsd has 18 decimals, answer has 8 decimals
        // result = priceUsd * 1e8 / answer → 18 decimals (wei)
        return (priceUsd * 1e8) / uint256(answer);
    }

    /* ----- SETTERS ----- */

    /// @notice Set the payment token address. Only callable by the contract owner.
    /// @dev Reverts if there are unclaimed token balances to prevent totalRecorded corruption.
    /// @param _token The new payment token address.
    function setPaymentToken(address _token) external onlyOwner {
        if (_token == address(0)) {
            revert Paypink__InvalidAddress();
        }
        if (totalRecorded != 0) {
            revert Paypink__OutstandingTokenBalance();
        }
        address oldToken = paymentToken;
        paymentToken = _token;
        emit PaymentTokenUpdated(oldToken, _token);
    }

    /// @notice Set the authorized x402 facilitator address. Only callable by the contract owner.
    /// @param _caller The new authorized caller address.
    function setAuthorizedX402Caller(address _caller) external onlyOwner {
        if (_caller == address(0)) {
            revert Paypink__InvalidAddress();
        }
        address oldCaller = authorizedX402Caller;
        authorizedX402Caller = _caller;
        emit AuthorizedX402CallerSet(oldCaller, _caller);
    }

    /// @notice Update the price feed address. Only callable by the contract owner.
    /// @param _feed The new AggregatorV3Interface-compatible price feed address (must use 8 decimals).
    function setPriceFeed(address _feed) external onlyOwner {
        if (_feed == address(0)) {
            revert Paypink__InvalidAddress();
        }
        if (AggregatorV3Interface(_feed).decimals() != 8) {
            revert Paypink__InvalidPriceFeedDecimals();
        }
        address oldFeed = address(priceFeed);
        priceFeed = AggregatorV3Interface(_feed);
        emit PriceFeedUpdated(oldFeed, _feed);
    }

    /// @notice Update the maximum staleness for price feed data. Only callable by the contract owner.
    /// @param _maxStaleness New max staleness in seconds (min 60, max 86400).
    function setMaxStaleness(uint256 _maxStaleness) external onlyOwner {
        if (_maxStaleness < 60 || _maxStaleness > 86400) {
            revert Paypink__InvalidStaleness();
        }
        uint256 oldStaleness = maxStaleness;
        maxStaleness = _maxStaleness;
        emit MaxStalenessUpdated(oldStaleness, _maxStaleness);
    }

    /* ----- WITHDRAWALS ----- */

    /// @notice Withdraw the caller's accumulated creator earnings.
    function withdraw() external {
        // checks
        uint256 valueToWithdraw = creatorBalances[msg.sender];
        if (valueToWithdraw == 0) {
            revert Paypink__NothingToWithdraw();
        }

        // effects
        creatorBalances[msg.sender] = 0;

        // interactions
        (bool sent,) = msg.sender.call{value: valueToWithdraw}("");
        if (!sent) {
            revert Paypink__Withdraw_FailedToSend();
        }
    }

    /// @notice Withdraw accumulated platform fees. Only callable by the contract owner.
    function withdrawPlatformFees() external onlyOwner {
        uint256 valueToWithdraw = ownerBalance;
        if (valueToWithdraw == 0) {
            revert Paypink__NothingToWithdraw();
        }
        ownerBalance = 0;
        (bool sent,) = owner.call{value: valueToWithdraw}("");
        if (!sent) {
            revert Paypink__Withdraw_FailedToSend();
        }
    }

    /// @notice Withdraw the caller's accumulated ERC-20 earnings.
    function withdrawTokens() external {
        uint256 valueToWithdraw = creatorTokenBalances[msg.sender];
        if (valueToWithdraw == 0) {
            revert Paypink__NothingToWithdraw();
        }
        creatorTokenBalances[msg.sender] = 0;
        totalRecorded -= valueToWithdraw;
        IERC20(paymentToken).safeTransfer(msg.sender, valueToWithdraw);
    }

    /// @notice Withdraw accumulated platform ERC-20 fees. Only callable by the contract owner.
    function withdrawPlatformTokenFees() external onlyOwner {
        uint256 valueToWithdraw = platformTokenBalance;
        if (valueToWithdraw == 0) {
            revert Paypink__NothingToWithdraw();
        }
        platformTokenBalance = 0;
        totalRecorded -= valueToWithdraw;
        IERC20(paymentToken).safeTransfer(owner, valueToWithdraw);
    }

    /* ----- VIEWS ----- */

    /// @notice Return the full article metadata for a given slug.
    /// @param slug Unique identifier of the article.
    /// @return article The Article struct (zero-initialized if not found).
    function getArticle(string calldata slug) external view returns (Article memory) {
        bytes32 key = keccak256(abi.encodePacked(slug));
        return articles[key];
    }

    /// @notice Return all article slug-hashes registered by a creator.
    /// @param creator Address of the creator.
    /// @return slugHashes Array of `keccak256(slug)` keys.
    function getCreatorArticles(address creator) external view returns (bytes32[] memory) {
        return creatorArticles[creator];
    }

    /// @notice Return the withdrawable balance for a creator.
    /// @param creator Address of the creator.
    function getCreatorBalance(address creator) external view returns (uint256) {
        return creatorBalances[creator];
    }

    /// @notice Return the ETH amount required to pay for an article at current prices.
    /// @param slug Unique identifier of the article.
    /// @return ethAmount The amount in wei the reader must send (before any slippage buffer).
    function getArticlePriceInEth(string calldata slug) external view returns (uint256) {
        bytes32 key = keccak256(abi.encodePacked(slug));
        return _getEthAmountForUsd(articles[key].price);
    }
}
