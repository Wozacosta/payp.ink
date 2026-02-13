// https://www.getfoundry.sh/forge/testing
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {Paypink} from "../contracts/Paypink.sol";
import {console} from "forge-std/console.sol";

contract PaypinkTest is Test {
    address deployer = makeAddr("deployer");
    address author = makeAddr("author");
    address reader = makeAddr("reader");

    Paypink public paypink;

    modifier withArticle() {
        vm.startPrank(author);
        paypink.registerArticle("article-slug", 100, "contentHashed");
        vm.stopPrank();
        _;
    }

    function setUp() public {
        vm.prank(deployer);
        paypink = new Paypink();
    }

    function test_Checkowner() public {
        assertEq(paypink.owner(), deployer);
    }

    function test_RegisterArticle() public {
        vm.startPrank(author);

        bytes32 expectedKey = keccak256(abi.encodePacked("article-slug"));
        vm.expectEmit(address(paypink));
        emit Paypink.ArticleRegistered(expectedKey, author, "article-slug", 1);

        paypink.registerArticle("article-slug", 1, "contentHashed");

        Paypink.Article memory newArticle = paypink.getArticle("article-slug");

        assertEq(newArticle.slug, "article-slug");
        assertEq(newArticle.price, 1);
        assertEq(newArticle.contentHash, "contentHashed");
        vm.stopPrank();
    }

    function test_RegisterArticle_SlugAlreadyTaken() public withArticle {
        vm.startPrank(author);
        vm.expectRevert(Paypink.Paypink__SlugTaken.selector);
        paypink.registerArticle("article-slug", 100, "contentHashedBis");
        vm.stopPrank();
    }

    function test_PayForArticle_WrongPrice() public withArticle {
        vm.startPrank(reader);
        vm.expectRevert(abi.encodeWithSelector(Paypink.Paypink__WrongPrice.selector, 100, 0));
        paypink.payForArticle("article-slug");
        vm.stopPrank();
    }

    function test_PayForArticle_ArticleNotFound() public {
        vm.startPrank(reader);
        vm.expectRevert(Paypink.Paypink__ArticleNotFound.selector);
        paypink.payForArticle("article-slug-toto");
        vm.stopPrank();
    }

    function test_PayForArticleSmallPrice() public {
        vm.startPrank(author);
        paypink.registerArticle("article-slug", 1, "contentHashed");
        vm.stopPrank();

        vm.deal(reader, 1 ether);
        vm.startPrank(reader);

        paypink.payForArticle{value: 1}("article-slug");

        Paypink.Article memory newArticle = paypink.getArticle("article-slug");
        assertEq(newArticle.views, 1);
        assertEq(newArticle.earned, 1);

        assertEq(paypink.ownerBalance(), 0);
        // NOTE: we favor creator here
        assertEq(paypink.creatorBalances(author), 1);
    }

    function test_PayForArticle() public withArticle {
        vm.deal(reader, 1 ether);
        vm.startPrank(reader);
        paypink.payForArticle{value: 100}("article-slug");

        Paypink.Article memory newArticle = paypink.getArticle("article-slug");
        assertEq(newArticle.views, 1);
        assertEq(newArticle.earned, 100);

        assertEq(paypink.ownerBalance(), 1);
        assertEq(paypink.creatorBalances(author), 99);
    }

    function test_Withdraw_NothingToWithdraw() public {
        vm.prank(author);
        vm.expectRevert(Paypink.Paypink__NothingToWithdraw.selector);
        paypink.withdraw();
    }

    function test_Withdraw_SendsCorrectAmount() public withArticle {
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        paypink.payForArticle{value: 100}("article-slug");

        uint256 expectedPayout = paypink.creatorBalances(author);
        uint256 balanceBefore = author.balance;
        vm.prank(author);
        paypink.withdraw();
        assertEq(author.balance - balanceBefore, expectedPayout);
    }

    function test_Withdraw_ZerosBalance() public withArticle {
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        paypink.payForArticle{value: 100}("article-slug");

        vm.prank(author);
        paypink.withdraw();
        assertEq(paypink.creatorBalances(author), 0);
    }

    function test_Withdraw_RevertsOnSecondCall() public withArticle {
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        paypink.payForArticle{value: 100}("article-slug");

        vm.startPrank(author);
        paypink.withdraw();
        vm.expectRevert(Paypink.Paypink__NothingToWithdraw.selector);
        paypink.withdraw();
        vm.stopPrank();
    }

    function test_PayForArticle_AlreadyPaid() public withArticle {
        vm.deal(reader, 1 ether);
        vm.startPrank(reader);
        paypink.payForArticle{value: 100}("article-slug");
        vm.expectRevert(Paypink.Paypink__AlreadyPaid.selector);
        paypink.payForArticle{value: 100}("article-slug");
        vm.stopPrank();
    }

    function test_PayForArticle_EmitsEvent() public withArticle {
        bytes32 expectedKey = keccak256(abi.encodePacked("article-slug"));
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        vm.expectEmit(address(paypink));
        emit Paypink.ArticlePaid(expectedKey, reader, 100);
        paypink.payForArticle{value: 100}("article-slug");
    }

    // --- tipBySlug ---

    function test_TipBySlug() public withArticle {
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        paypink.tipBySlug{value: 1000}("article-slug");

        assertEq(paypink.creatorBalances(author), 990);
        assertEq(paypink.ownerBalance(), 10);

        Paypink.Article memory article = paypink.getArticle("article-slug");
        assertEq(article.earned, 1000);
        // tips should not increment views
        assertEq(article.views, 0);
    }

    function test_TipBySlug_ArticleNotFound() public {
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        vm.expectRevert(Paypink.Paypink__ArticleNotFound.selector);
        paypink.tipBySlug{value: 100}("nonexistent");
    }

    function test_TipBySlug_MultipleTips() public withArticle {
        vm.deal(reader, 1 ether);
        vm.startPrank(reader);
        paypink.tipBySlug{value: 1000}("article-slug");
        paypink.tipBySlug{value: 1000}("article-slug");
        vm.stopPrank();

        assertEq(paypink.creatorBalances(author), 1980);
        assertEq(paypink.ownerBalance(), 20);

        Paypink.Article memory article = paypink.getArticle("article-slug");
        assertEq(article.earned, 2000);
    }

    function test_TipBySlug_SmallAmount() public withArticle {
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        paypink.tipBySlug{value: 1}("article-slug");

        // same rounding behavior as payForArticle: creator gets full amount
        assertEq(paypink.creatorBalances(author), 1);
        assertEq(paypink.ownerBalance(), 0);
    }

    function test_TipBySlug_EmitsEvent() public withArticle {
        bytes32 expectedKey = keccak256(abi.encodePacked("article-slug"));
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        vm.expectEmit(address(paypink));
        emit Paypink.ArticleTipped(expectedKey, author, "article-slug", 500);
        paypink.tipBySlug{value: 500}("article-slug");
    }

    // --- tipByAddress ---

    function test_TipByAddress() public {
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        paypink.tipByAddress{value: 1000}(author);

        assertEq(paypink.creatorBalances(author), 990);
        assertEq(paypink.ownerBalance(), 10);
    }

    function test_TipByAddress_MultipleTips() public {
        vm.deal(reader, 1 ether);
        vm.startPrank(reader);
        paypink.tipByAddress{value: 1000}(author);
        paypink.tipByAddress{value: 1000}(author);
        vm.stopPrank();

        assertEq(paypink.creatorBalances(author), 1980);
        assertEq(paypink.ownerBalance(), 20);
    }

    function test_TipByAddress_SmallAmount() public {
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        paypink.tipByAddress{value: 1}(author);

        assertEq(paypink.creatorBalances(author), 1);
        assertEq(paypink.ownerBalance(), 0);
    }

    function test_TipByAddress_EmitsEvent() public {
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        vm.expectEmit(address(paypink));
        emit Paypink.CreatorTipped(author, 500);
        paypink.tipByAddress{value: 500}(author);
    }

    // --- withdrawPlatformFees ---

    function test_WithdrawPlatformFees_NothingToWithdraw() public {
        vm.prank(deployer);
        vm.expectRevert(Paypink.Paypink__NothingToWithdraw.selector);
        paypink.withdrawPlatformFees();
    }

    function test_WithdrawPlatformFees_OnlyOwner() public withArticle {
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        paypink.payForArticle{value: 100}("article-slug");

        vm.prank(author);
        vm.expectRevert(Paypink.Paypink__OwnerOnly.selector);
        paypink.withdrawPlatformFees();
    }

    function test_WithdrawPlatformFees_SendsCorrectAmount() public withArticle {
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        paypink.payForArticle{value: 100}("article-slug");

        uint256 expectedPayout = paypink.ownerBalance();
        uint256 balanceBefore = deployer.balance;
        vm.prank(deployer);
        paypink.withdrawPlatformFees();
        assertEq(deployer.balance - balanceBefore, expectedPayout);
    }

    function test_WithdrawPlatformFees_ZerosBalance() public withArticle {
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        paypink.payForArticle{value: 100}("article-slug");

        vm.prank(deployer);
        paypink.withdrawPlatformFees();
        assertEq(paypink.ownerBalance(), 0);
    }

    function test_WithdrawPlatformFees_RevertsOnSecondCall() public withArticle {
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        paypink.payForArticle{value: 100}("article-slug");

        vm.startPrank(deployer);
        paypink.withdrawPlatformFees();
        vm.expectRevert(Paypink.Paypink__NothingToWithdraw.selector);
        paypink.withdrawPlatformFees();
        vm.stopPrank();
    }

    // --- tipByAddress guards ---

    function test_TipByAddress_RevertsOnZeroAddress() public {
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        vm.expectRevert(Paypink.Paypink__InvalidAddress.selector);
        paypink.tipByAddress{value: 1000}(address(0));
    }

    // --- view helpers ---

    function test_GetCreatorArticles_ReturnsSlugHashes() public {
        vm.startPrank(author);
        paypink.registerArticle("first-article", 100, "hash1");
        paypink.registerArticle("second-article", 200, "hash2");
        vm.stopPrank();

        bytes32[] memory slugHashes = paypink.getCreatorArticles(author);
        assertEq(slugHashes.length, 2);
        assertEq(slugHashes[0], keccak256(abi.encodePacked("first-article")));
        assertEq(slugHashes[1], keccak256(abi.encodePacked("second-article")));
    }

    function test_GetCreatorArticles_EmptyForUnknownCreator() public view {
        bytes32[] memory slugHashes = paypink.getCreatorArticles(address(0xdead));
        assertEq(slugHashes.length, 0);
    }

    function test_GetCreatorBalance() public withArticle {
        assertEq(paypink.getCreatorBalance(author), 0);

        vm.deal(reader, 1 ether);
        vm.prank(reader);
        paypink.payForArticle{value: 100}("article-slug");

        assertEq(paypink.getCreatorBalance(author), 99);
    }

    // --- zero-value tips ---

    function test_TipBySlug_ZeroValue() public withArticle {
        vm.prank(reader);
        paypink.tipBySlug{value: 0}("article-slug");

        assertEq(paypink.creatorBalances(author), 0);
        assertEq(paypink.ownerBalance(), 0);

        Paypink.Article memory article = paypink.getArticle("article-slug");
        assertEq(article.earned, 0);
    }

    function test_TipByAddress_ZeroValue() public {
        vm.prank(reader);
        paypink.tipByAddress{value: 0}(author);

        assertEq(paypink.creatorBalances(author), 0);
        assertEq(paypink.ownerBalance(), 0);
    }

    // --- reentrancy ---

    function test_Withdraw_ReentrancyResistance() public withArticle {
        ReentrancyAttacker attacker = new ReentrancyAttacker(paypink);

        // Register an article as the attacker so it becomes a creator
        vm.prank(address(attacker));
        paypink.registerArticle("attacker-article", 100, "hash");

        // Reader pays for attacker's article
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        paypink.payForArticle{value: 100}("attacker-article");

        // Attacker tries to re-enter on withdraw — should get NothingToWithdraw on re-entry
        vm.prank(address(attacker));
        attacker.attack();

        // Attacker should only have received the payout once (99 wei)
        assertEq(address(attacker).balance, 99);
        assertEq(paypink.creatorBalances(address(attacker)), 0);
    }
}

/// @dev Helper contract that attempts reentrancy on withdraw().
contract ReentrancyAttacker {
    Paypink private target;
    uint256 private attackCount;

    constructor(Paypink _target) {
        target = _target;
    }

    function attack() external {
        attackCount = 0;
        target.withdraw();
    }

    receive() external payable {
        attackCount++;
        if (attackCount < 3) {
            // Try to re-enter — should revert with NothingToWithdraw because balance is zeroed
            try target.withdraw() {} catch {}
        }
    }
}
