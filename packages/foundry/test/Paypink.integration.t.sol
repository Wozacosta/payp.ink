// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {Paypink} from "../contracts/Paypink.sol";
import {console} from "forge-std/console.sol";

contract PaypinkTest is Test {
    address deployer = makeAddr("deployer");
    address author = makeAddr("author");
    address reader = makeAddr("reader");
    address reader2 = makeAddr("reader2");

    Paypink public paypink;

    function setUp() public {
        vm.prank(deployer);
        paypink = new Paypink();
    }

    function test_RegisterArticle_PayForArticle_CreatorWithdraws() public {
        uint256 PRICE = 1000;
        vm.startPrank(author);
        paypink.registerArticle("article-slug", PRICE, "contentHashed");
        assertEq(paypink.ownerBalance(), 0);
        assertEq(paypink.creatorBalances(author), 0);
        vm.stopPrank();

        vm.deal(reader, 1 ether);
        vm.startPrank(reader);
        paypink.payForArticle{value: PRICE}("article-slug");

        Paypink.Article memory newArticle = paypink.getArticle("article-slug");
        assertEq(newArticle.views, 1);
        assertEq(newArticle.earned, PRICE);

        vm.expectRevert(Paypink.Paypink__AlreadyPaid.selector);
        paypink.payForArticle("article-slug");

        console.log("Owner balance:", paypink.ownerBalance());
        console.log("Creator balance:", paypink.creatorBalances(author));
        assertEq(paypink.ownerBalance(), 10);
        assertEq(paypink.creatorBalances(author), 990);

        vm.stopPrank();

        vm.deal(reader2, 1 ether);
        vm.startPrank(reader2);
        paypink.payForArticle{value: PRICE}("article-slug");

        console.log("Owner balance:", paypink.ownerBalance());
        console.log("Creator balance:", paypink.creatorBalances(author));
        assertEq(paypink.ownerBalance(), 20);
        assertEq(paypink.creatorBalances(author), 1980);

        vm.stopPrank();
    }
}
