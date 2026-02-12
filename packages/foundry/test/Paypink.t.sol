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
}
