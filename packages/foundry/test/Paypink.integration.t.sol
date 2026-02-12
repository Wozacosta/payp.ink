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

        // --- Register article as author ---
        vm.startPrank(author);
        paypink.registerArticle("article-slug", PRICE, "contentHashed");
        assertEq(paypink.ownerBalance(), 0);
        assertEq(paypink.creatorBalances(author), 0);
        vm.stopPrank();

        // --- Reader 1 pays for article ---
        vm.deal(reader, 1 ether);
        vm.startPrank(reader);
        paypink.payForArticle{value: PRICE}("article-slug");

        Paypink.Article memory newArticle = paypink.getArticle("article-slug");
        assertEq(newArticle.views, 1);
        assertEq(newArticle.earned, PRICE);

        // --- Reader 1 tries to pay again (should revert) ---
        vm.expectRevert(Paypink.Paypink__AlreadyPaid.selector);
        paypink.payForArticle("article-slug");

        // --- Verify 99/1 split after first payment ---
        console.log("Owner balance:", paypink.ownerBalance());
        console.log("Creator balance:", paypink.creatorBalances(author));
        assertEq(paypink.ownerBalance(), 10);
        assertEq(paypink.creatorBalances(author), 990);

        vm.stopPrank();

        // --- Reader 2 pays for the same article ---
        vm.deal(reader2, 1 ether);
        vm.startPrank(reader2);
        paypink.payForArticle{value: PRICE}("article-slug");

        // --- Verify balances accumulated correctly ---
        console.log("Owner balance:", paypink.ownerBalance());
        console.log("Creator balance:", paypink.creatorBalances(author));
        assertEq(paypink.ownerBalance(), 20);
        assertEq(paypink.creatorBalances(author), 1980);

        vm.stopPrank();

        // --- Author withdraws his balance ---

        uint256 balanceAuthor = paypink.creatorBalances(author);
        vm.startPrank(author);
        paypink.withdraw();
        assertEq(author.balance, balanceAuthor);
        assertEq(paypink.creatorBalances(author), 0);

        vm.stopPrank();
    }
}
