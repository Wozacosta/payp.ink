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

// Useful for debugging. Remove when deploying to a live network.
import "forge-std/console.sol";

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
    mapping(bytes32 slugHash => mapping(address reader => bool paid)) public hasPaid;
    mapping(address creator => uint256 balance) public creatorBalances;

    constructor() {
        owner = msg.sender;
    }

    /* ----- EVENTS ----- */
    event ArticlePaid(bytes32 indexed key, address indexed reader, uint256 amount);
    event ArticleRegistered(bytes32 indexed key, address indexed creator, string slug, uint256 price);

    /* ----- ERRORS ----- */
    error Paypink__WrongPrice(uint256 expected, uint256 actual);
    error Paypink__SlugTaken();
    error Paypink__AlreadyPaid();
    error Paypink__ArticleNotFound();

    /**
     *
     * @param slug a slug
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
        articles[key] = article;
        emit ArticleRegistered(key, article.creator, article.slug, article.price);
    }

    // Pay to read an article (99% to creator, 1% to platform)
    // NOTE: Uses the "Pull over Push" pattern — balances are credited here, not transferred.
    // Recipients call withdraw() / withdrawPlatformFees() to collect.
    // This prevents a malicious/broken creator address from blocking payments.
    // See: https://fravoll.github.io/solidity-patterns/pull_over_push.html
    // See: https://docs.openzeppelin.com/contracts/4.x/api/security#PullPayment
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

        uint256 creatorShare = msg.value * 99 / 100;
        console.log("Creator share:", creatorShare);
        creatorBalances[articles[key].creator] += creatorShare;
        console.log("msg.value:", msg.value);
        uint256 platformShare = msg.value - creatorShare;
        ownerBalance += platformShare;
        emit ArticlePaid(key, msg.sender, msg.value);
    }

    // Tip a creator via article slug (same 99/1 split)
    function tipBySlug(string calldata slug) external payable {}

    // Tip a creator directly by address (same 99/1 split)
    function tipByAddress(address creator) external payable {}

    // Creator withdraws their earned balance
    function withdraw() external {}

    // Platform owner withdraws platform fees
    function withdrawPlatformFees() external {}

    // --- Views ---

    function getArticle(string calldata slug) external view returns (Article memory) {
        bytes32 key = keccak256(abi.encodePacked(slug));
        return articles[key];
    }

    function getCreatorArticles(address creator) external view returns (bytes32[] memory) {}

    function getCreatorBalance(address creator) external view returns (uint256) {}
}
