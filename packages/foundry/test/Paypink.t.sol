// https://www.getfoundry.sh/forge/testing
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {Paypink} from "../contracts/Paypink.sol";
import {MockV3Aggregator} from "../contracts/mocks/MockV3Aggregator.sol";
import {console} from "forge-std/console.sol";

contract PaypinkTest is Test {
    address deployer = makeAddr("deployer");
    address author = makeAddr("author");
    address reader = makeAddr("reader");

    address token = makeAddr("token");

    Paypink public paypink;
    MockV3Aggregator public mockFeed;

    // Mock ETH/USD price: $2000 with 8 decimals
    int256 constant ETH_USD_PRICE = 2000_00000000;
    // Article price: $10 with 18 decimals
    uint256 constant TEN_USD = 10e18;
    // Expected ETH for $10 at $2000/ETH = 0.005 ETH = 5e15 wei
    uint256 constant EXPECTED_ETH_FOR_10_USD = 5e15;

    modifier withArticle() {
        vm.startPrank(author);
        paypink.registerArticle("article-slug", TEN_USD, "contentHashed");
        vm.stopPrank();
        _;
    }

    function setUp() public {
        vm.startPrank(deployer);
        mockFeed = new MockV3Aggregator(8, ETH_USD_PRICE);
        paypink = new Paypink(token, address(mockFeed));
        vm.stopPrank();
    }

    function test_Checkowner() public {
        assertEq(paypink.owner(), deployer);
    }

    function test_RegisterArticle() public {
        vm.startPrank(author);

        bytes32 expectedKey = keccak256(abi.encodePacked("article-slug"));
        vm.expectEmit(address(paypink));
        emit Paypink.ArticleRegistered(expectedKey, author, "article-slug", 1e18);

        paypink.registerArticle("article-slug", 1e18, "contentHashed");

        Paypink.Article memory newArticle = paypink.getArticle("article-slug");

        assertEq(newArticle.slug, "article-slug");
        assertEq(newArticle.price, 1e18);
        assertEq(newArticle.contentHash, "contentHashed");
        vm.stopPrank();
    }

    function test_RegisterArticle_SlugAlreadyTaken() public withArticle {
        vm.startPrank(author);
        vm.expectRevert(Paypink.Paypink__SlugTaken.selector);
        paypink.registerArticle("article-slug", TEN_USD, "contentHashedBis");
        vm.stopPrank();
    }

    // --- payForArticle ---

    function test_PayForArticle_InsufficientPayment() public withArticle {
        vm.deal(reader, 1 ether);
        vm.startPrank(reader);
        vm.expectRevert(
            abi.encodeWithSelector(Paypink.Paypink__InsufficientPayment.selector, EXPECTED_ETH_FOR_10_USD, 0)
        );
        paypink.payForArticle("article-slug");
        vm.stopPrank();
    }

    function test_PayForArticle_ArticleNotFound() public {
        vm.startPrank(reader);
        vm.expectRevert(Paypink.Paypink__ArticleNotFound.selector);
        paypink.payForArticle("article-slug-toto");
        vm.stopPrank();
    }

    function test_PayForArticle_ExactPayment() public withArticle {
        vm.deal(reader, 1 ether);
        vm.startPrank(reader);

        paypink.payForArticle{value: EXPECTED_ETH_FOR_10_USD}("article-slug");

        Paypink.Article memory newArticle = paypink.getArticle("article-slug");
        assertEq(newArticle.views, 1);
        assertEq(newArticle.earned, EXPECTED_ETH_FOR_10_USD);

        // 99/1 split: platform gets 1%, creator gets 99%
        uint256 platformShare = EXPECTED_ETH_FOR_10_USD / 100;
        uint256 creatorShare = EXPECTED_ETH_FOR_10_USD - platformShare;
        assertEq(paypink.ownerBalance(), platformShare);
        assertEq(paypink.creatorBalances(author), creatorShare);
        vm.stopPrank();
    }

    function test_PayForArticle_OverpaymentRefund() public withArticle {
        vm.deal(reader, 1 ether);
        uint256 overpayment = EXPECTED_ETH_FOR_10_USD + 1000;
        uint256 balanceBefore = reader.balance;

        vm.prank(reader);
        paypink.payForArticle{value: overpayment}("article-slug");

        // Reader should have been refunded the excess
        uint256 spent = balanceBefore - reader.balance;
        assertEq(spent, EXPECTED_ETH_FOR_10_USD);

        // Contract should only have the required amount (split into balances)
        Paypink.Article memory article = paypink.getArticle("article-slug");
        assertEq(article.earned, EXPECTED_ETH_FOR_10_USD);
    }

    function test_PayForArticle_FreeArticle() public {
        vm.prank(author);
        paypink.registerArticle("free-article", 0, "freeHash");

        vm.prank(reader);
        paypink.payForArticle{value: 0}("free-article");

        assertTrue(paypink.hasPaid(keccak256(abi.encodePacked("free-article")), reader));
    }

    function test_PayForArticle_PriceConversion() public {
        // $5 article at $2000/ETH = 0.0025 ETH = 2.5e15 wei
        uint256 fiveUsd = 5e18;
        vm.prank(author);
        paypink.registerArticle("five-dollar", fiveUsd, "hash5");

        uint256 expectedEth = (fiveUsd * 1e8) / uint256(ETH_USD_PRICE);
        assertEq(expectedEth, 2.5e15);

        vm.deal(reader, 1 ether);
        vm.prank(reader);
        paypink.payForArticle{value: expectedEth}("five-dollar");

        Paypink.Article memory article = paypink.getArticle("five-dollar");
        assertEq(article.earned, expectedEth);
    }

    function test_PayForArticle_PriceChangeMidway() public withArticle {
        // ETH price drops to $1000 → article now costs more ETH
        mockFeed.updateAnswer(1000_00000000);

        uint256 newExpectedEth = (TEN_USD * 1e8) / 1000_00000000; // 0.01 ETH
        assertEq(newExpectedEth, 1e16);

        vm.deal(reader, 1 ether);
        vm.prank(reader);
        paypink.payForArticle{value: newExpectedEth}("article-slug");

        Paypink.Article memory article = paypink.getArticle("article-slug");
        assertEq(article.earned, newExpectedEth);
    }

    // --- price feed validation ---

    function test_PayForArticle_StalePrice() public withArticle {
        // Warp 2 hours ahead — feed data becomes stale (maxStaleness = 1 hour)
        vm.warp(block.timestamp + 7200);

        vm.deal(reader, 1 ether);
        vm.prank(reader);
        vm.expectRevert(Paypink.Paypink__StalePrice.selector);
        paypink.payForArticle{value: 1 ether}("article-slug");
    }

    function test_PayForArticle_InvalidPrice() public withArticle {
        mockFeed.updateAnswer(0);

        vm.deal(reader, 1 ether);
        vm.prank(reader);
        vm.expectRevert(Paypink.Paypink__InvalidPrice.selector);
        paypink.payForArticle{value: 1 ether}("article-slug");
    }

    function test_PayForArticle_NegativePrice() public withArticle {
        mockFeed.updateAnswer(-1);

        vm.deal(reader, 1 ether);
        vm.prank(reader);
        vm.expectRevert(Paypink.Paypink__InvalidPrice.selector);
        paypink.payForArticle{value: 1 ether}("article-slug");
    }

    // --- getArticlePriceInEth view ---

    function test_GetArticlePriceInEth() public withArticle {
        uint256 ethPrice = paypink.getArticlePriceInEth("article-slug");
        assertEq(ethPrice, EXPECTED_ETH_FOR_10_USD);
    }

    function test_GetArticlePriceInEth_FreeArticle() public {
        vm.prank(author);
        paypink.registerArticle("free", 0, "hash");
        assertEq(paypink.getArticlePriceInEth("free"), 0);
    }

    // --- setPriceFeed / setMaxStaleness ---

    function test_SetPriceFeed() public {
        MockV3Aggregator newFeed = new MockV3Aggregator(8, 3000_00000000);
        vm.prank(deployer);
        paypink.setPriceFeed(address(newFeed));
        assertEq(address(paypink.priceFeed()), address(newFeed));
    }

    function test_SetPriceFeed_OnlyOwner() public {
        vm.prank(author);
        vm.expectRevert(Paypink.Paypink__OwnerOnly.selector);
        paypink.setPriceFeed(address(1));
    }

    function test_SetPriceFeed_ZeroAddress() public {
        vm.prank(deployer);
        vm.expectRevert(Paypink.Paypink__InvalidAddress.selector);
        paypink.setPriceFeed(address(0));
    }

    function test_SetMaxStaleness() public {
        vm.prank(deployer);
        paypink.setMaxStaleness(7200);
        assertEq(paypink.maxStaleness(), 7200);
    }

    function test_SetMaxStaleness_OnlyOwner() public {
        vm.prank(author);
        vm.expectRevert(Paypink.Paypink__OwnerOnly.selector);
        paypink.setMaxStaleness(7200);
    }

    function test_Withdraw_NothingToWithdraw() public {
        vm.prank(author);
        vm.expectRevert(Paypink.Paypink__NothingToWithdraw.selector);
        paypink.withdraw();
    }

    function test_Withdraw_SendsCorrectAmount() public withArticle {
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        paypink.payForArticle{value: EXPECTED_ETH_FOR_10_USD}("article-slug");

        uint256 expectedPayout = paypink.creatorBalances(author);
        uint256 balanceBefore = author.balance;
        vm.prank(author);
        paypink.withdraw();
        assertEq(author.balance - balanceBefore, expectedPayout);
    }

    function test_Withdraw_ZerosBalance() public withArticle {
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        paypink.payForArticle{value: EXPECTED_ETH_FOR_10_USD}("article-slug");

        vm.prank(author);
        paypink.withdraw();
        assertEq(paypink.creatorBalances(author), 0);
    }

    function test_Withdraw_RevertsOnSecondCall() public withArticle {
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        paypink.payForArticle{value: EXPECTED_ETH_FOR_10_USD}("article-slug");

        vm.startPrank(author);
        paypink.withdraw();
        vm.expectRevert(Paypink.Paypink__NothingToWithdraw.selector);
        paypink.withdraw();
        vm.stopPrank();
    }

    function test_PayForArticle_AlreadyPaid() public withArticle {
        vm.deal(reader, 1 ether);
        vm.startPrank(reader);
        paypink.payForArticle{value: EXPECTED_ETH_FOR_10_USD}("article-slug");
        vm.expectRevert(Paypink.Paypink__AlreadyPaid.selector);
        paypink.payForArticle{value: EXPECTED_ETH_FOR_10_USD}("article-slug");
        vm.stopPrank();
    }

    function test_PayForArticle_EmitsEvent() public withArticle {
        bytes32 expectedKey = keccak256(abi.encodePacked("article-slug"));
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        vm.expectEmit(address(paypink));
        emit Paypink.ArticlePaid(expectedKey, reader, EXPECTED_ETH_FOR_10_USD);
        paypink.payForArticle{value: EXPECTED_ETH_FOR_10_USD}("article-slug");
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
        paypink.payForArticle{value: EXPECTED_ETH_FOR_10_USD}("article-slug");

        vm.prank(author);
        vm.expectRevert(Paypink.Paypink__OwnerOnly.selector);
        paypink.withdrawPlatformFees();
    }

    function test_WithdrawPlatformFees_SendsCorrectAmount() public withArticle {
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        paypink.payForArticle{value: EXPECTED_ETH_FOR_10_USD}("article-slug");

        uint256 expectedPayout = paypink.ownerBalance();
        uint256 balanceBefore = deployer.balance;
        vm.prank(deployer);
        paypink.withdrawPlatformFees();
        assertEq(deployer.balance - balanceBefore, expectedPayout);
    }

    function test_WithdrawPlatformFees_ZerosBalance() public withArticle {
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        paypink.payForArticle{value: EXPECTED_ETH_FOR_10_USD}("article-slug");

        vm.prank(deployer);
        paypink.withdrawPlatformFees();
        assertEq(paypink.ownerBalance(), 0);
    }

    function test_WithdrawPlatformFees_RevertsOnSecondCall() public withArticle {
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        paypink.payForArticle{value: EXPECTED_ETH_FOR_10_USD}("article-slug");

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
        paypink.registerArticle("first-article", TEN_USD, "hash1");
        paypink.registerArticle("second-article", 20e18, "hash2");
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
        paypink.payForArticle{value: EXPECTED_ETH_FOR_10_USD}("article-slug");

        uint256 expectedCreatorShare = EXPECTED_ETH_FOR_10_USD - (EXPECTED_ETH_FOR_10_USD / 100);
        assertEq(paypink.getCreatorBalance(author), expectedCreatorShare);
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

    // --- setMaxStaleness bounds ---

    function test_SetMaxStaleness_TooLow() public {
        vm.prank(deployer);
        vm.expectRevert(Paypink.Paypink__InvalidStaleness.selector);
        paypink.setMaxStaleness(59);
    }

    function test_SetMaxStaleness_TooHigh() public {
        vm.prank(deployer);
        vm.expectRevert(Paypink.Paypink__InvalidStaleness.selector);
        paypink.setMaxStaleness(86401);
    }

    function test_SetMaxStaleness_MinBound() public {
        vm.prank(deployer);
        paypink.setMaxStaleness(60);
        assertEq(paypink.maxStaleness(), 60);
    }

    function test_SetMaxStaleness_MaxBound() public {
        vm.prank(deployer);
        paypink.setMaxStaleness(86400);
        assertEq(paypink.maxStaleness(), 86400);
    }

    function test_SetMaxStaleness_EmitsEvent() public {
        vm.prank(deployer);
        vm.expectEmit(address(paypink));
        emit Paypink.MaxStalenessUpdated(3600, 7200);
        paypink.setMaxStaleness(7200);
    }

    function test_SetPriceFeed_EmitsEvent() public {
        MockV3Aggregator newFeed = new MockV3Aggregator(8, 3000_00000000);
        vm.prank(deployer);
        vm.expectEmit(address(paypink));
        emit Paypink.PriceFeedUpdated(address(mockFeed), address(newFeed));
        paypink.setPriceFeed(address(newFeed));
    }

    function test_SetPriceFeed_WrongDecimals() public {
        MockV3Aggregator badFeed = new MockV3Aggregator(18, 2000_00000000);
        vm.prank(deployer);
        vm.expectRevert(Paypink.Paypink__InvalidPriceFeedDecimals.selector);
        paypink.setPriceFeed(address(badFeed));
    }

    function test_Constructor_ZeroAddressPriceFeed() public {
        vm.expectRevert(Paypink.Paypink__InvalidAddress.selector);
        new Paypink(token, address(0));
    }

    function test_Constructor_WrongDecimalsPriceFeed() public {
        MockV3Aggregator badFeed = new MockV3Aggregator(6, 2000_00000000);
        vm.expectRevert(Paypink.Paypink__InvalidPriceFeedDecimals.selector);
        new Paypink(token, address(badFeed));
    }

    // --- refund to non-receivable contract ---

    function test_PayForArticle_RefundFailsGoesToPlatform() public withArticle {
        // Deploy a contract that rejects ETH (no receive/fallback)
        RefundRejecter rejecter = new RefundRejecter(paypink);
        vm.deal(address(rejecter), 1 ether);

        uint256 overpayment = EXPECTED_ETH_FOR_10_USD + 1000;
        rejecter.payOverpay("article-slug", overpayment);

        // Platform balance should include the 1% fee PLUS the failed refund
        uint256 platformFee = EXPECTED_ETH_FOR_10_USD / 100;
        assertEq(paypink.ownerBalance(), platformFee + 1000);
    }

    // --- fuzz tests ---

    /// @notice Fuzz: price conversion math is consistent for any valid price/feed combo.
    function testFuzz_PriceConversion(uint256 priceUsd, uint256 ethUsdPrice) public {
        // Bound to realistic ranges to avoid overflow
        priceUsd = bound(priceUsd, 1, 1_000_000e18); // $0.000…001 to $1M
        ethUsdPrice = bound(ethUsdPrice, 100_00000000, 100_000_00000000); // $100 to $100,000

        mockFeed.updateAnswer(int256(ethUsdPrice));

        vm.prank(author);
        paypink.registerArticle("fuzz-article", priceUsd, "fuzzHash");

        uint256 ethAmount = paypink.getArticlePriceInEth("fuzz-article");

        // Verify: ethAmount * ethUsdPrice / 1e8 ≈ priceUsd (within rounding)
        // The conversion is: ethAmount = priceUsd * 1e8 / ethUsdPrice
        // So: ethAmount * ethUsdPrice should be <= priceUsd * 1e8 (truncation rounds down)
        uint256 product = ethAmount * ethUsdPrice;
        assertLe(product, priceUsd * 1e8, "ETH amount too high");
        // And the rounding error should be less than 1 unit of ethUsdPrice
        assertGe(product + ethUsdPrice, priceUsd * 1e8, "ETH amount too low (rounding > 1 price unit)");
    }

    /// @notice Fuzz: overpayment always refunds or goes to platform — no ETH is lost.
    function testFuzz_OverpaymentAccounting(uint256 overpayExtra) public withArticle {
        overpayExtra = bound(overpayExtra, 1, 10 ether);
        uint256 totalSent = EXPECTED_ETH_FOR_10_USD + overpayExtra;

        vm.deal(reader, totalSent);
        uint256 balanceBefore = reader.balance;

        vm.prank(reader);
        paypink.payForArticle{value: totalSent}("article-slug");

        // Reader gets refund, only EXPECTED_ETH_FOR_10_USD stays in contract
        uint256 spent = balanceBefore - reader.balance;
        assertEq(spent, EXPECTED_ETH_FOR_10_USD, "Reader should only spend the required amount");

        // Contract accounting: platform + creator = required ETH
        uint256 platformShare = EXPECTED_ETH_FOR_10_USD / 100;
        uint256 creatorShare = EXPECTED_ETH_FOR_10_USD - platformShare;
        assertEq(paypink.ownerBalance(), platformShare);
        assertEq(paypink.creatorBalances(author), creatorShare);
    }

    /// @notice Fuzz: setMaxStaleness rejects out-of-bounds values.
    function testFuzz_SetMaxStaleness_Bounds(uint256 staleness) public {
        vm.prank(deployer);
        if (staleness < 60 || staleness > 86400) {
            vm.expectRevert(Paypink.Paypink__InvalidStaleness.selector);
        }
        paypink.setMaxStaleness(staleness);
    }

    /// @notice Fuzz: 99/1 split never loses wei — creator + platform == total.
    function testFuzz_SplitPaymentConservation(uint256 amount) public {
        amount = bound(amount, 0, 100 ether);

        vm.prank(author);
        paypink.registerArticle("split-article", 0, "splitHash");

        // Use tipByAddress as a proxy to test _splitPayment
        vm.deal(reader, amount);
        vm.prank(reader);
        paypink.tipByAddress{value: amount}(author);

        uint256 creatorGot = paypink.creatorBalances(author);
        uint256 platformGot = paypink.ownerBalance();
        assertEq(creatorGot + platformGot, amount, "Wei conservation: creator + platform must equal total");
    }

    // --- reentrancy ---

    function test_Withdraw_ReentrancyResistance() public withArticle {
        ReentrancyAttacker attacker = new ReentrancyAttacker(paypink);

        // Register an article as the attacker so it becomes a creator
        vm.prank(address(attacker));
        paypink.registerArticle("attacker-article", TEN_USD, "hash");

        // Reader pays for attacker's article
        vm.deal(reader, 1 ether);
        vm.prank(reader);
        paypink.payForArticle{value: EXPECTED_ETH_FOR_10_USD}("attacker-article");

        // Attacker tries to re-enter on withdraw — should get NothingToWithdraw on re-entry
        vm.prank(address(attacker));
        attacker.attack();

        // Attacker should only have received the payout once
        uint256 expectedCreatorShare = EXPECTED_ETH_FOR_10_USD - (EXPECTED_ETH_FOR_10_USD / 100);
        assertEq(address(attacker).balance, expectedCreatorShare);
        assertEq(paypink.creatorBalances(address(attacker)), 0);
    }
}

/// @dev Helper contract that overpays from a contract with no receive() — refund will fail.
contract RefundRejecter {
    Paypink private target;

    constructor(Paypink _target) {
        target = _target;
    }

    function payOverpay(string calldata slug, uint256 amount) external {
        target.payForArticle{value: amount}(slug);
    }

    // Deliberately no receive() or fallback() — ETH refunds will fail
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
