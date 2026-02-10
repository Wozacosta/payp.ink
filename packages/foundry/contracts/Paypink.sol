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
    address public immutable owner;

    constructor() {
        owner = msg.sender;
    }

    struct Article {
        string slug;
        address creator;
        uint256 price; // NOTE: price in wei, in a next version, we would use chainlink and store price as usd here
        string contentHash;
        uint256 views;
        uint256 earned;
    }

    mapping(bytes32 slugHash => Article) articles;

    /**
     *
     * @param slug a slug
     */
    function registerArticle(string calldata slug, uint256 price, string calldata contentHash) external {
        bytes32 key = keccak256(abi.encodePacked(slug));
        require(articles[key].creator == address(0), "slug taken");
        Article storage article = articles[key];
        article.slug = slug;
        article.creator = msg.sender; // NOTE: could be passed as arg?
        article.price = price;
        article.contentHash = contentHash;
        articles[key] = article;
    }

    // Pay to read an article (99% to creator, 1% to platform)
    function payForArticle(string calldata slug) external payable {}

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
