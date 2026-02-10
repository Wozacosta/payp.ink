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

    function setUp() public {
        vm.prank(deployer);
        paypink = new Paypink();
    }

    function test_Checkowner() public view {
        assertEq(paypink.owner(), deployer);
    }

    function test_RegisterArticle() public {
        vm.startPrank(author);
        paypink.registerArticle("article-slug", 1, "contentHashed");

        Paypink.Article memory newArticle = paypink.getArticle("article-slug");
        assertEq(newArticle.slug, "article-slug");
        assertEq(newArticle.price, 1);
        assertEq(newArticle.contentHash, "contentHashed");
        vm.stopPrank();
    }

    function test_RegisterArticle_SlugAlreadyTaken() public {
        vm.startPrank(author);
        paypink.registerArticle("article-slug", 1, "contentHashed");
        vm.expectRevert(Paypink.Article_SlugTaken.selector);
        paypink.registerArticle("article-slug", 1, "contentHashedBis");
    }

    function test_PayForArticle_minPriceError() public {
        vm.startPrank(author);
        paypink.registerArticle("article-slug", 1, "contentHashed");
        vm.stopPrank();

        vm.startPrank(reader);
        vm.expectRevert(abi.encodeWithSelector(Paypink.WrongPrice.selector, 1, 0));
        paypink.payForArticle("article-slug");
        vm.stopPrank();
    }

    function test_PayForArticle_articleDoesntExistError() public {
        vm.startPrank(reader);
        vm.expectRevert(Paypink.Article_DoesntExist.selector);
        paypink.payForArticle("article-slug-toto");
        vm.stopPrank();
    }

    function test_PayForArticle() public {
        vm.startPrank(author);
        paypink.registerArticle("article-slug", 1, "contentHashed");
        vm.stopPrank();

        vm.deal(reader, 1 ether);
        vm.startPrank(reader);
        paypink.payForArticle{value: 1}("article-slug");
        vm.stopPrank();

        Paypink.Article memory newArticle = paypink.getArticle("article-slug");
        assertEq(newArticle.views, 1);
        assertEq(newArticle.earned, 1);
    }
}
