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
        paypink.registerArticle("article-slug", 1, "contentHashed");
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
        paypink.registerArticle("article-slug", 1, "contentHashedBis");
        vm.stopPrank();
    }

    function test_PayForArticle_WrongPrice() public withArticle {
        vm.startPrank(reader);
        vm.expectRevert(abi.encodeWithSelector(Paypink.Paypink__WrongPrice.selector, 1, 0));
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
        paypink.payForArticle{value: 1}("article-slug");

        Paypink.Article memory newArticle = paypink.getArticle("article-slug");
        assertEq(newArticle.views, 1);
        assertEq(newArticle.earned, 1);

        assertEq(paypink.ownerBalance(), 1);
        assertEq(paypink.creatorBalances(author), 0);
    }
}
