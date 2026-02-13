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

    address token = makeAddr("token");

    Paypink public paypink;

    function setUp() public {
        vm.prank(deployer);
        paypink = new Paypink(token);
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

        // --- Owner withdraws his balance ---

        vm.startPrank(deployer);
        assertEq(deployer.balance, 0);
        paypink.withdrawPlatformFees();
        assertEq(paypink.ownerBalance(), 0);
        assertEq(deployer.balance, 20);
        vm.stopPrank();
    }

    function test_Register_Pay_TipBySlug_TipByAddress_Withdraw() public {
        uint256 PRICE = 1000;
        uint256 TIP_SLUG = 500;
        uint256 TIP_DIRECT = 200;

        // --- Register article ---
        vm.prank(author);
        paypink.registerArticle("tipped-article", PRICE, "hashTipped");

        // --- Reader pays for the article ---
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        paypink.payForArticle{value: PRICE}("tipped-article");

        // after payment: creator 990, platform 10
        assertEq(paypink.creatorBalances(author), 990);
        assertEq(paypink.ownerBalance(), 10);

        // --- Reader tips by slug ---
        vm.prank(reader);
        paypink.tipBySlug{value: TIP_SLUG}("tipped-article");

        // after slug tip: creator 990+495=1485, platform 10+5=15
        assertEq(paypink.creatorBalances(author), 1485);
        assertEq(paypink.ownerBalance(), 15);

        // tip should add to earned but not views
        Paypink.Article memory article = paypink.getArticle("tipped-article");
        assertEq(article.views, 1);
        assertEq(article.earned, PRICE + TIP_SLUG);

        // --- Reader2 tips author directly by address ---
        vm.deal(reader2, 1 ether);
        vm.prank(reader2);
        paypink.tipByAddress{value: TIP_DIRECT}(author);

        // after direct tip: creator 1485+198=1683, platform 15+2=17
        assertEq(paypink.creatorBalances(author), 1683);
        assertEq(paypink.ownerBalance(), 17);

        // direct tip should not affect article earned
        article = paypink.getArticle("tipped-article");
        assertEq(article.earned, PRICE + TIP_SLUG);

        // --- Author withdraws everything ---
        uint256 expectedPayout = paypink.creatorBalances(author);
        vm.prank(author);
        paypink.withdraw();
        assertEq(author.balance, expectedPayout);
        assertEq(paypink.creatorBalances(author), 0);

        // --- Platform withdraws ---
        vm.prank(deployer);
        paypink.withdrawPlatformFees();
        assertEq(deployer.balance, 17);
        assertEq(paypink.ownerBalance(), 0);

        // --- Contract should have zero balance left ---
        assertEq(address(paypink).balance, 0);
    }
}
