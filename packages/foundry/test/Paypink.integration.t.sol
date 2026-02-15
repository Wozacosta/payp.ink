// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {Paypink} from "../contracts/Paypink.sol";
import {MockV3Aggregator} from "../contracts/mocks/MockV3Aggregator.sol";
import {console} from "forge-std/console.sol";

contract PaypinkIntegrationTest is Test {
    address deployer = makeAddr("deployer");
    address author = makeAddr("author");
    address reader = makeAddr("reader");
    address reader2 = makeAddr("reader2");

    address token = makeAddr("token");

    Paypink public paypink;
    MockV3Aggregator public mockFeed;

    int256 constant ETH_USD_PRICE = 2000_00000000;
    uint256 constant TEN_USD = 10e18;
    uint256 constant EXPECTED_ETH = 5e15; // $10 / $2000 = 0.005 ETH

    function setUp() public {
        vm.startPrank(deployer);
        mockFeed = new MockV3Aggregator(8, ETH_USD_PRICE);
        paypink = new Paypink(token, address(mockFeed));
        vm.stopPrank();
    }

    function test_RegisterArticle_PayForArticle_CreatorWithdraws() public {
        // --- Register article as author ---
        vm.startPrank(author);
        paypink.registerArticle("article-slug", TEN_USD, "contentHashed");
        assertEq(paypink.ownerBalance(), 0);
        assertEq(paypink.creatorBalances(author), 0);
        vm.stopPrank();

        // --- Reader 1 pays for article ---
        vm.deal(reader, 1 ether);
        vm.startPrank(reader);
        paypink.payForArticle{value: EXPECTED_ETH}("article-slug");

        Paypink.Article memory newArticle = paypink.getArticle("article-slug");
        assertEq(newArticle.views, 1);
        assertEq(newArticle.earned, EXPECTED_ETH);

        // --- Reader 1 tries to pay again (should revert) ---
        vm.expectRevert(Paypink.Paypink__AlreadyPaid.selector);
        paypink.payForArticle("article-slug");

        // --- Verify 99/1 split after first payment ---
        uint256 platformShare = EXPECTED_ETH / 100;
        uint256 creatorShare = EXPECTED_ETH - platformShare;
        assertEq(paypink.ownerBalance(), platformShare);
        assertEq(paypink.creatorBalances(author), creatorShare);

        vm.stopPrank();

        // --- Reader 2 pays for the same article ---
        vm.deal(reader2, 1 ether);
        vm.startPrank(reader2);
        paypink.payForArticle{value: EXPECTED_ETH}("article-slug");

        // --- Verify balances accumulated correctly ---
        assertEq(paypink.ownerBalance(), platformShare * 2);
        assertEq(paypink.creatorBalances(author), creatorShare * 2);

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
        assertEq(deployer.balance, platformShare * 2);
        vm.stopPrank();
    }

    function test_Register_Pay_TipBySlug_TipByAddress_Withdraw() public {
        uint256 TIP_SLUG = 500;
        uint256 TIP_DIRECT = 200;

        // --- Register article ---
        vm.prank(author);
        paypink.registerArticle("tipped-article", TEN_USD, "hashTipped");

        // --- Reader pays for the article ---
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        paypink.payForArticle{value: EXPECTED_ETH}("tipped-article");

        uint256 platformAfterPay = EXPECTED_ETH / 100;
        uint256 creatorAfterPay = EXPECTED_ETH - platformAfterPay;
        assertEq(paypink.creatorBalances(author), creatorAfterPay);
        assertEq(paypink.ownerBalance(), platformAfterPay);

        // --- Reader tips by slug ---
        vm.prank(reader);
        paypink.tipBySlug{value: TIP_SLUG}("tipped-article");

        uint256 tipPlatform = TIP_SLUG / 100;
        uint256 tipCreator = TIP_SLUG - tipPlatform;
        assertEq(paypink.creatorBalances(author), creatorAfterPay + tipCreator);
        assertEq(paypink.ownerBalance(), platformAfterPay + tipPlatform);

        // tip should add to earned but not views
        Paypink.Article memory article = paypink.getArticle("tipped-article");
        assertEq(article.views, 1);
        assertEq(article.earned, EXPECTED_ETH + TIP_SLUG);

        // --- Reader2 tips author directly by address ---
        vm.deal(reader2, 1 ether);
        vm.prank(reader2);
        paypink.tipByAddress{value: TIP_DIRECT}(author);

        uint256 directPlatform = TIP_DIRECT / 100;
        uint256 directCreator = TIP_DIRECT - directPlatform;
        uint256 totalCreator = creatorAfterPay + tipCreator + directCreator;
        uint256 totalPlatform = platformAfterPay + tipPlatform + directPlatform;
        assertEq(paypink.creatorBalances(author), totalCreator);
        assertEq(paypink.ownerBalance(), totalPlatform);

        // direct tip should not affect article earned
        article = paypink.getArticle("tipped-article");
        assertEq(article.earned, EXPECTED_ETH + TIP_SLUG);

        // --- Author withdraws everything ---
        uint256 expectedPayout = paypink.creatorBalances(author);
        vm.prank(author);
        paypink.withdraw();
        assertEq(author.balance, expectedPayout);
        assertEq(paypink.creatorBalances(author), 0);

        // --- Platform withdraws ---
        vm.prank(deployer);
        paypink.withdrawPlatformFees();
        assertEq(deployer.balance, totalPlatform);
        assertEq(paypink.ownerBalance(), 0);

        // --- Contract should have zero balance left ---
        assertEq(address(paypink).balance, 0);
    }

    function test_OverpayAndRefund_IntegrationFlow() public {
        vm.prank(author);
        paypink.registerArticle("overpay-test", TEN_USD, "hash");

        vm.deal(reader, 1 ether);
        uint256 balanceBefore = reader.balance;

        // Send 5% extra
        uint256 overpayment = EXPECTED_ETH * 105 / 100;
        vm.prank(reader);
        paypink.payForArticle{value: overpayment}("overpay-test");

        // Reader should have only spent EXPECTED_ETH (excess refunded)
        assertEq(balanceBefore - reader.balance, EXPECTED_ETH);

        // Article earned should reflect exact amount, not overpayment
        Paypink.Article memory article = paypink.getArticle("overpay-test");
        assertEq(article.earned, EXPECTED_ETH);
        assertTrue(paypink.hasPaid(keccak256(abi.encodePacked("overpay-test")), reader));
    }
}
