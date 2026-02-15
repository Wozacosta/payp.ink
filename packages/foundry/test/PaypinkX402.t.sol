// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {Paypink} from "../contracts/Paypink.sol";
import {MockV3Aggregator} from "../contracts/mocks/MockV3Aggregator.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";

contract PaypinkX402Test is Test {
    address deployer = makeAddr("deployer");
    address author = makeAddr("author");
    address reader = makeAddr("reader");
    address x402Caller = makeAddr("x402Caller");
    address stranger = makeAddr("stranger");

    ERC20Mock usdc;
    MockV3Aggregator mockFeed;
    Paypink paypink;

    modifier withArticle() {
        vm.prank(author);
        paypink.registerArticle("article-slug", 100, "contentHashed");
        _;
    }

    /// @dev Records an x402 payment. In the cross-chain model, tokens settle on a different chain,
    ///      so no tokens are minted to the contract here.
    modifier withX402Payment(string memory slug, address _reader, uint256 amount) {
        vm.prank(x402Caller);
        paypink.recordX402Payment(slug, _reader, amount);
        _;
    }

    function setUp() public {
        usdc = new ERC20Mock();
        mockFeed = new MockV3Aggregator(8, 2000_00000000);
        vm.startPrank(deployer);
        paypink = new Paypink(address(usdc), address(mockFeed));
        paypink.setAuthorizedX402Caller(x402Caller);
        vm.stopPrank();
    }

    // --- recordX402Payment ---

    function test_RecordX402Payment_HappyPath() public withArticle {
        uint256 amount = 1000;

        bytes32 expectedKey = keccak256(abi.encodePacked("article-slug"));
        vm.prank(x402Caller);
        vm.expectEmit(address(paypink));
        emit Paypink.X402PaymentRecorded(expectedKey, reader, amount);
        paypink.recordX402Payment("article-slug", reader, amount);

        // State updates
        assertTrue(paypink.hasPaid(expectedKey, reader));
        Paypink.Article memory article = paypink.getArticle("article-slug");
        assertEq(article.views, 1);
        assertEq(article.earned, amount);

        // 99/1 split into token balances
        assertEq(paypink.creatorTokenBalances(author), 990);
        assertEq(paypink.platformTokenBalance(), 10);
    }

    function test_RecordX402Payment_UnauthorizedCaller() public withArticle {
        vm.prank(stranger);
        vm.expectRevert(Paypink.Paypink__UnauthorizedCaller.selector);
        paypink.recordX402Payment("article-slug", reader, 1000);
    }

    function test_RecordX402Payment_ArticleNotFound() public {
        vm.prank(x402Caller);
        vm.expectRevert(Paypink.Paypink__ArticleNotFound.selector);
        paypink.recordX402Payment("nonexistent", reader, 1000);
    }

    function test_RecordX402Payment_AlreadyPaid() public withArticle {
        vm.startPrank(x402Caller);
        paypink.recordX402Payment("article-slug", reader, 1000);
        vm.expectRevert(Paypink.Paypink__AlreadyPaid.selector);
        paypink.recordX402Payment("article-slug", reader, 1000);
        vm.stopPrank();
    }

    function test_RecordX402Payment_SmallAmount_RoundingFavorsCreator() public withArticle {
        vm.prank(x402Caller);
        paypink.recordX402Payment("article-slug", reader, 1);

        // 1 / 100 = 0 platform, 1 - 0 = 1 creator
        assertEq(paypink.creatorTokenBalances(author), 1);
        assertEq(paypink.platformTokenBalance(), 0);
    }

    // --- ERC-20 withdrawals ---

    function test_WithdrawTokens_HappyPath() public withArticle withX402Payment("article-slug", reader, 1000) {
        uint256 expectedPayout = paypink.creatorTokenBalances(author);
        assertEq(expectedPayout, 990);

        // Simulate tokens arriving on-chain (same-chain flow)
        usdc.mint(address(paypink), 1000);

        vm.prank(author);
        paypink.withdrawTokens();

        assertEq(usdc.balanceOf(author), 990);
        assertEq(paypink.creatorTokenBalances(author), 0);
    }

    function test_WithdrawTokens_NothingToWithdraw() public {
        vm.prank(author);
        vm.expectRevert(Paypink.Paypink__NothingToWithdraw.selector);
        paypink.withdrawTokens();
    }

    function test_WithdrawTokens_RevertsOnSecondCall()
        public
        withArticle
        withX402Payment("article-slug", reader, 1000)
    {
        usdc.mint(address(paypink), 1000);

        vm.startPrank(author);
        paypink.withdrawTokens();
        vm.expectRevert(Paypink.Paypink__NothingToWithdraw.selector);
        paypink.withdrawTokens();
        vm.stopPrank();
    }

    function test_WithdrawPlatformTokenFees_HappyPath()
        public
        withArticle
        withX402Payment("article-slug", reader, 1000)
    {
        uint256 expectedPayout = paypink.platformTokenBalance();
        assertEq(expectedPayout, 10);

        // Simulate tokens arriving on-chain (same-chain flow)
        usdc.mint(address(paypink), 1000);

        vm.prank(deployer);
        paypink.withdrawPlatformTokenFees();

        assertEq(usdc.balanceOf(deployer), 10);
        assertEq(paypink.platformTokenBalance(), 0);
    }

    function test_WithdrawPlatformTokenFees_NothingToWithdraw() public {
        vm.prank(deployer);
        vm.expectRevert(Paypink.Paypink__NothingToWithdraw.selector);
        paypink.withdrawPlatformTokenFees();
    }

    function test_WithdrawPlatformTokenFees_OnlyOwner()
        public
        withArticle
        withX402Payment("article-slug", reader, 1000)
    {
        vm.prank(stranger);
        vm.expectRevert(Paypink.Paypink__OwnerOnly.selector);
        paypink.withdrawPlatformTokenFees();
    }

    function test_WithdrawBoth_DrainsFully() public withArticle withX402Payment("article-slug", reader, 1000) {
        // Simulate tokens arriving on-chain
        usdc.mint(address(paypink), 1000);

        vm.prank(author);
        paypink.withdrawTokens();

        vm.prank(deployer);
        paypink.withdrawPlatformTokenFees();

        assertEq(usdc.balanceOf(address(paypink)), 0);
    }

    // --- Admin: setPaymentToken ---

    function test_SetPaymentToken_HappyPath() public {
        address newToken = makeAddr("newToken");
        vm.prank(deployer);
        vm.expectEmit(address(paypink));
        emit Paypink.PaymentTokenUpdated(address(usdc), newToken);
        paypink.setPaymentToken(newToken);

        assertEq(paypink.paymentToken(), newToken);
    }

    function test_SetPaymentToken_OnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(Paypink.Paypink__OwnerOnly.selector);
        paypink.setPaymentToken(makeAddr("newToken"));
    }

    function test_SetPaymentToken_RevertsOnZeroAddress() public {
        vm.prank(deployer);
        vm.expectRevert(Paypink.Paypink__InvalidAddress.selector);
        paypink.setPaymentToken(address(0));
    }

    // --- Admin: setAuthorizedX402Caller ---

    function test_SetAuthorizedX402Caller_HappyPath() public {
        address newCaller = makeAddr("newCaller");
        vm.prank(deployer);
        vm.expectEmit(address(paypink));
        emit Paypink.AuthorizedX402CallerSet(x402Caller, newCaller);
        paypink.setAuthorizedX402Caller(newCaller);

        assertEq(paypink.authorizedX402Caller(), newCaller);
    }

    function test_SetAuthorizedX402Caller_OnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(Paypink.Paypink__OwnerOnly.selector);
        paypink.setAuthorizedX402Caller(makeAddr("newCaller"));
    }

    function test_SetAuthorizedX402Caller_RevertsOnZeroAddress() public {
        vm.prank(deployer);
        vm.expectRevert(Paypink.Paypink__InvalidAddress.selector);
        paypink.setAuthorizedX402Caller(address(0));
    }

    // --- Integration: x402 full flow ---

    function test_FullX402Flow_PayRecordWithdraw() public {
        // Register article
        vm.prank(author);
        paypink.registerArticle("paid-article", 500, "hash123");

        // Backend calls recordX402Payment (no on-chain tokens needed for recording)
        vm.prank(x402Caller);
        paypink.recordX402Payment("paid-article", reader, 500);

        // Verify state
        bytes32 key = keccak256(abi.encodePacked("paid-article"));
        assertTrue(paypink.hasPaid(key, reader));
        assertEq(paypink.creatorTokenBalances(author), 495);
        assertEq(paypink.platformTokenBalance(), 5);

        // Simulate tokens arriving on-chain for withdrawal
        usdc.mint(address(paypink), 500);

        // Creator withdraws
        vm.prank(author);
        paypink.withdrawTokens();
        assertEq(usdc.balanceOf(author), 495);

        // Platform withdraws
        vm.prank(deployer);
        paypink.withdrawPlatformTokenFees();
        assertEq(usdc.balanceOf(deployer), 5);

        // Contract fully settled
        assertEq(usdc.balanceOf(address(paypink)), 0);
    }
}
