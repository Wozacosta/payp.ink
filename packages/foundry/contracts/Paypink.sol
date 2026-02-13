//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

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
        /// @dev Stored in wei. A future version may use Chainlink to accept USD-denominated prices.
        uint256 price;
        string contentHash;
        uint256 views;
        uint256 earned;
    }

    /* ----- STATE VARIABLES ----- */

    /// @notice Deployer of the contract; receives platform fees.
    address public immutable owner;
    address public paymentToken;
    address public authorizedX402Caller;
    /// @notice Accumulated platform fees available for withdrawal.
    uint256 public ownerBalance;
    /// @notice Total ERC-20 tokens accounted for through known payment paths.
    uint256 public totalRecorded;

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

    constructor(address _paymentToken) {
        owner = msg.sender;
        paymentToken = _paymentToken;
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

    /* ----- ERRORS ----- */

    /// @notice Thrown when `msg.value` does not match the article price.
    error Paypink__WrongPrice(uint256 expected, uint256 actual);
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
    /// @notice Thrown when the contract's token balance doesn't cover the recorded amount.
    error Paypink__InsufficientTokenBalance();

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
    /// @param price Price in wei a reader must pay to unlock the article.
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

    /// @notice Pay the exact article price to unlock it. Revenue is split 99/1 (creator/platform).
    /// @dev Uses pull-over-push: balances are credited, not transferred. Recipients call
    ///      `withdraw()` or `withdrawPlatformFees()` to collect. The creator receives
    ///      `amount - amount/100`, so rounding favours the creator for non-multiple-of-100 values.
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

        if (msg.value != article.price) {
            revert Paypink__WrongPrice(article.price, msg.value);
        }
        hasPaid[key][msg.sender] = true;
        article.views += 1;
        article.earned += msg.value;

        _splitPayment(msg.value, article.creator);
        emit ArticlePaid(key, msg.sender, msg.value);
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

    /// @notice Record an x402 ERC-20 payment after the facilitator has transferred tokens to this contract.
    /// @param slug Unique identifier of the article.
    /// @param reader Address of the reader who paid via x402.
    /// @param amount ERC-20 amount paid.
    function recordX402Payment(string calldata slug, address reader, uint256 amount) external onlyAuthorizedX402Caller {
        bytes32 key = keccak256(abi.encodePacked(slug));
        Article storage article = articles[key];
        if (article.creator == address(0)) {
            revert Paypink__ArticleNotFound();
        }
        if (hasPaid[key][reader]) {
            revert Paypink__AlreadyPaid();
        }

        uint256 unrecorded = IERC20(paymentToken).balanceOf(address(this)) - totalRecorded;
        if (unrecorded < amount) {
            revert Paypink__InsufficientTokenBalance();
        }

        hasPaid[key][reader] = true;
        article.views += 1;
        article.earned += amount;

        uint256 platformShare = amount / 100;
        uint256 creatorShare = amount - platformShare;
        creatorTokenBalances[article.creator] += creatorShare;
        platformTokenBalance += platformShare;
        totalRecorded += amount;

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

    /* ----- SETTERS ----- */

    /// @notice Set the payment token address. Only callable by the contract owner.
    /// @param _token The new payment token address.
    function setPaymentToken(address _token) external onlyOwner {
        if (_token == address(0)) {
            revert Paypink__InvalidAddress();
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
}
