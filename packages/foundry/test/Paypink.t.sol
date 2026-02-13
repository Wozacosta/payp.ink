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
}
