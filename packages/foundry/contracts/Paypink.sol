//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

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
 * @notice Paypink is a decentralized platform for creators to monetize their content.
 */

contract Paypink {
    struct Article {
        string slug;
        address creator;
        uint256 price; // NOTE: price in wei, in a next version, we would use chainlink and store price as usd here
        string contentHash;
        uint256 views;
        uint256 earned;
    }

    address public immutable owner;
    uint256 public ownerBalance;

    mapping(bytes32 slugHash => Article) articles;
    mapping(address creator => bytes32[] slugHashes) creatorArticles;
    mapping(bytes32 slugHash => mapping(address reader => bool paid)) public hasPaid;
    mapping(address creator => uint256 balance) public creatorBalances;

    constructor() {
        owner = msg.sender;
    }

    /* ----- EVENTS ----- */
    event ArticlePaid(bytes32 indexed key, address indexed reader, uint256 amount);
    event ArticleRegistered(bytes32 indexed key, address indexed creator, string slug, uint256 price);
    event ArticleTipped(bytes32 indexed key, address indexed creator, string slug, uint256 tip);
    event CreatorTipped(address indexed creator, uint256 tip);

    /* ----- ERRORS ----- */
    error Paypink__WrongPrice(uint256 expected, uint256 actual);
    error Paypink__OwnerOnly();
    error Paypink__SlugTaken();
    error Paypink__AlreadyPaid();
    error Paypink__ArticleNotFound();
    error Paypink__NothingToWithdraw();
    error Paypink__Withdraw_FailedToSend();
    error Paypink__InvalidAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert Paypink__OwnerOnly();
        }
        _;
    }

    /**
     *
     * @param slug a slug
     * @notice we're allowing free articles
     */
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

    // Pay to read an article (99% to creator, 1% to platform)
    // NOTE: Uses the "Pull over Push" pattern — balances are credited here, not transferred.
    // Recipients call withdraw() / withdrawPlatformFees() to collect.
    // This prevents a malicious/broken creator address from blocking payments.
    // See: https://fravoll.github.io/solidity-patterns/pull_over_push.html
    // See: https://docs.openzeppelin.com/contracts/4.x/api/security#PullPayment
    /**
     *
     * @param slug article reader pays for
     * @notice The function allows a reader to pay for an article and receive a share of the revenue.
     * We avoid undercharging creators for non‑multiple‑of‑100 payments.
     */
    function payForArticle(string calldata slug) external payable {
        bytes32 key = keccak256(abi.encodePacked(slug));
        if (articles[key].creator == address(0)) {
            revert Paypink__ArticleNotFound();
        }
        if (hasPaid[key][msg.sender]) {
            revert Paypink__AlreadyPaid();
        }

        if (msg.value != articles[key].price) {
            revert Paypink__WrongPrice(articles[key].price, msg.value);
        }
        hasPaid[key][msg.sender] = true;
        articles[key].views += 1;
        articles[key].earned += msg.value;

        address creator = articles[key].creator;
        _splitPayment(msg.value, creator);
        emit ArticlePaid(key, msg.sender, msg.value);
    }

    // Tip a creator via article slug (same 99/1 split)
    function tipBySlug(string calldata slug) external payable {
        bytes32 key = keccak256(abi.encodePacked(slug));
        if (articles[key].creator == address(0)) {
            revert Paypink__ArticleNotFound();
        }
        articles[key].earned += msg.value;
        address creator = articles[key].creator;
        _splitPayment(msg.value, creator);
        emit ArticleTipped(key, creator, slug, msg.value);
    }

    // Tip a creator directly by address (same 99/1 split)
    function tipByAddress(address creator) external payable {
        if (creator == address(0)) {
            revert Paypink__InvalidAddress();
        }
        _splitPayment(msg.value, creator);
        emit CreatorTipped(creator, msg.value);
    }

    function _splitPayment(uint256 amount, address creator) internal {
        uint256 platformShare = amount * 1 / 100;
        uint256 creatorShare = amount - platformShare;
        creatorBalances[creator] += creatorShare;
        ownerBalance += platformShare;
    }

    // Creator withdraws their earned balance
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

    // Platform owner withdraws platform fees
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

    // --- Views ---

    function getArticle(string calldata slug) external view returns (Article memory) {
        bytes32 key = keccak256(abi.encodePacked(slug));
        return articles[key];
    }

    function getCreatorArticles(address creator) external view returns (bytes32[] memory) {
        return creatorArticles[creator];
    }

    function getCreatorBalance(address creator) external view returns (uint256) {
        return creatorBalances[creator];
    }
}
