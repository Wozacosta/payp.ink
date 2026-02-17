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

    /// @dev Mints tokens to the contract (simulating facilitator settlement) and records the x402 payment.
    modifier withX402Payment(string memory slug, address _reader, uint256 amount) {
        usdc.mint(address(paypink), amount);
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

        // Simulate facilitator settling tokens into the contract
        usdc.mint(address(paypink), amount);

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

        // totalRecorded tracks the credited amount
        assertEq(paypink.totalRecorded(), amount);
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
        usdc.mint(address(paypink), 2000);
        vm.startPrank(x402Caller);
        paypink.recordX402Payment("article-slug", reader, 1000);
        vm.expectRevert(Paypink.Paypink__AlreadyPaid.selector);
        paypink.recordX402Payment("article-slug", reader, 1000);
        vm.stopPrank();
    }

    function test_RecordX402Payment_RevertsOnInsufficientBalance() public withArticle {
        // No tokens minted — contract has zero USDC
        vm.prank(x402Caller);
        vm.expectRevert(Paypink.Paypink__InsufficientTokenBalance.selector);
        paypink.recordX402Payment("article-slug", reader, 1000);
    }

    function test_RecordX402Payment_RevertsOnPartialBalance() public withArticle {
        // Mint less than the payment amount
        usdc.mint(address(paypink), 500);
        vm.prank(x402Caller);
        vm.expectRevert(Paypink.Paypink__InsufficientTokenBalance.selector);
        paypink.recordX402Payment("article-slug", reader, 1000);
    }

    function test_RecordX402Payment_SmallAmount_RoundingFavorsCreator() public withArticle {
        usdc.mint(address(paypink), 1);
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

        vm.prank(author);
        paypink.withdrawTokens();

        assertEq(usdc.balanceOf(author), 990);
        assertEq(paypink.creatorTokenBalances(author), 0);
        // totalRecorded decremented by withdrawn amount
        assertEq(paypink.totalRecorded(), 10); // only platform share remains
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

        vm.prank(deployer);
        paypink.withdrawPlatformTokenFees();

        assertEq(usdc.balanceOf(deployer), 10);
        assertEq(paypink.platformTokenBalance(), 0);
        assertEq(paypink.totalRecorded(), 990); // only creator share remains
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
        vm.prank(author);
        paypink.withdrawTokens();

        vm.prank(deployer);
        paypink.withdrawPlatformTokenFees();

        assertEq(usdc.balanceOf(address(paypink)), 0);
        assertEq(paypink.totalRecorded(), 0);
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

    function test_SetPaymentToken_RevertsWithOutstandingBalance()
        public
        withArticle
        withX402Payment("article-slug", reader, 1000)
    {
        vm.prank(deployer);
        vm.expectRevert(Paypink.Paypink__OutstandingTokenBalance.selector);
        paypink.setPaymentToken(makeAddr("newToken"));
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

    // --- Story 2-3: Creator USDC Withdrawal (edge cases) ---

    /// @dev Creator earns from two different articles, withdraws once — gets combined total.
    function test_WithdrawTokens_MultiArticleAccumulation() public {
        address reader2 = makeAddr("reader2");

        vm.startPrank(author);
        paypink.registerArticle("art-1", 100, "h1");
        paypink.registerArticle("art-2", 100, "h2");
        vm.stopPrank();

        // Two payments to same creator, different articles
        usdc.mint(address(paypink), 1000);
        vm.prank(x402Caller);
        paypink.recordX402Payment("art-1", reader, 1000);

        usdc.mint(address(paypink), 2000);
        vm.prank(x402Caller);
        paypink.recordX402Payment("art-2", reader2, 2000);

        // Creator accumulated 990 + 1980 = 2970
        assertEq(paypink.creatorTokenBalances(author), 2970);

        vm.prank(author);
        paypink.withdrawTokens();

        assertEq(usdc.balanceOf(author), 2970);
        assertEq(paypink.creatorTokenBalances(author), 0);
        // Platform fees remain: 10 + 20 = 30
        assertEq(paypink.totalRecorded(), 30);
    }

    /// @dev Creator withdraws, earns more from a new reader, withdraws again.
    function test_WithdrawTokens_WithdrawEarnWithdrawAgain() public {
        address reader2 = makeAddr("reader2");

        vm.prank(author);
        paypink.registerArticle("cycle", 100, "h");

        // First payment + withdrawal
        usdc.mint(address(paypink), 1000);
        vm.prank(x402Caller);
        paypink.recordX402Payment("cycle", reader, 1000);

        vm.prank(author);
        paypink.withdrawTokens();
        assertEq(usdc.balanceOf(author), 990);

        // Second payment from different reader + withdrawal
        usdc.mint(address(paypink), 500);
        vm.prank(x402Caller);
        paypink.recordX402Payment("cycle", reader2, 500);

        vm.prank(author);
        paypink.withdrawTokens();
        assertEq(usdc.balanceOf(author), 990 + 495);
        assertEq(paypink.creatorTokenBalances(author), 0);
    }

    /// @dev Two creators with separate articles — balances are fully isolated.
    function test_WithdrawTokens_TwoCreatorsIsolated() public {
        address author2 = makeAddr("author2");
        address reader2 = makeAddr("reader2");

        vm.prank(author);
        paypink.registerArticle("by-a1", 100, "h1");
        vm.prank(author2);
        paypink.registerArticle("by-a2", 100, "h2");

        usdc.mint(address(paypink), 1000);
        vm.prank(x402Caller);
        paypink.recordX402Payment("by-a1", reader, 1000);

        usdc.mint(address(paypink), 3000);
        vm.prank(x402Caller);
        paypink.recordX402Payment("by-a2", reader2, 3000);

        // author gets 990, author2 gets 2970
        assertEq(paypink.creatorTokenBalances(author), 990);
        assertEq(paypink.creatorTokenBalances(author2), 2970);

        // author2 withdraws first — should not affect author
        vm.prank(author2);
        paypink.withdrawTokens();
        assertEq(usdc.balanceOf(author2), 2970);
        assertEq(paypink.creatorTokenBalances(author), 990); // unchanged

        vm.prank(author);
        paypink.withdrawTokens();
        assertEq(usdc.balanceOf(author), 990);

        // Platform fees: 10 + 30 = 40
        assertEq(paypink.platformTokenBalance(), 40);
        assertEq(paypink.totalRecorded(), 40);
    }

    /// @dev Amount = 99 → platform gets 0 (99/100 rounds down). Creator can still withdraw the full 99.
    function test_WithdrawTokens_Amount99_PlatformGetsZero() public withArticle {
        usdc.mint(address(paypink), 99);
        vm.prank(x402Caller);
        paypink.recordX402Payment("article-slug", reader, 99);

        assertEq(paypink.creatorTokenBalances(author), 99);
        assertEq(paypink.platformTokenBalance(), 0);

        vm.prank(author);
        paypink.withdrawTokens();
        assertEq(usdc.balanceOf(author), 99);
        assertEq(usdc.balanceOf(address(paypink)), 0);
        assertEq(paypink.totalRecorded(), 0);

        // Platform has nothing to withdraw
        vm.prank(deployer);
        vm.expectRevert(Paypink.Paypink__NothingToWithdraw.selector);
        paypink.withdrawPlatformTokenFees();
    }

    /// @dev Creator is also the deployer (owner). Both ETH ownerBalance and token creatorTokenBalances
    ///      should be independently withdrawable without interference.
    function test_WithdrawTokens_CreatorIsAlsoPlatformOwner() public {
        // deployer registers an article (they are both creator and owner)
        vm.prank(deployer);
        paypink.registerArticle("owner-art", 100, "h");

        usdc.mint(address(paypink), 1000);
        vm.prank(x402Caller);
        paypink.recordX402Payment("owner-art", reader, 1000);

        // deployer has 990 as creator AND 10 as platform owner
        assertEq(paypink.creatorTokenBalances(deployer), 990);
        assertEq(paypink.platformTokenBalance(), 10);

        // Withdraw creator share
        vm.prank(deployer);
        paypink.withdrawTokens();
        assertEq(usdc.balanceOf(deployer), 990);

        // Withdraw platform share
        vm.prank(deployer);
        paypink.withdrawPlatformTokenFees();
        assertEq(usdc.balanceOf(deployer), 1000);

        assertEq(usdc.balanceOf(address(paypink)), 0);
        assertEq(paypink.totalRecorded(), 0);
    }

    /// @dev Unsolicited tokens airdropped to contract should not inflate withdrawable amounts.
    ///      Creator and platform only withdraw what was recorded, airdropped dust stays behind.
    function test_WithdrawTokens_UnsolicitedAirdropDoesNotInflateBalances() public withArticle {
        usdc.mint(address(paypink), 1000);
        vm.prank(x402Caller);
        paypink.recordX402Payment("article-slug", reader, 1000);

        // Someone airdrops 5000 USDC to the contract
        usdc.mint(address(paypink), 5000);

        // Creator balance is still only 990 (from the recorded payment)
        assertEq(paypink.creatorTokenBalances(author), 990);

        vm.prank(author);
        paypink.withdrawTokens();
        assertEq(usdc.balanceOf(author), 990); // not 990 + 5000

        vm.prank(deployer);
        paypink.withdrawPlatformTokenFees();
        assertEq(usdc.balanceOf(deployer), 10);

        // Airdropped 5000 remains stuck in contract — no accounting path to withdraw it
        assertEq(usdc.balanceOf(address(paypink)), 5000);
        assertEq(paypink.totalRecorded(), 0);
    }

    /// @dev Unsolicited airdrop can be "consumed" by future x402 payments (facilitator doesn't need to mint).
    function test_WithdrawTokens_AirdropCoversNextPayment() public {
        vm.prank(author);
        paypink.registerArticle("airdrop-art", 100, "h");

        // Airdrop 2000 tokens to the contract (no payment recorded)
        usdc.mint(address(paypink), 2000);

        // x402 payment of 1000 — balance check passes because 2000 - 0 >= 1000
        vm.prank(x402Caller);
        paypink.recordX402Payment("airdrop-art", reader, 1000);

        // Creator can withdraw their 990
        vm.prank(author);
        paypink.withdrawTokens();
        assertEq(usdc.balanceOf(author), 990);

        // Contract still holds 2000 - 990 = 1010, totalRecorded = 10 (platform share)
        assertEq(usdc.balanceOf(address(paypink)), 1010);
        assertEq(paypink.totalRecorded(), 10);
    }

    /// @dev Interleaved: creator A withdraws between payments to creator B — totalRecorded stays consistent.
    function test_WithdrawTokens_InterleavedWithdrawals() public {
        address author2 = makeAddr("author2");
        address reader2 = makeAddr("reader2");
        address reader3 = makeAddr("reader3");

        vm.prank(author);
        paypink.registerArticle("interleave-a", 100, "h1");
        vm.prank(author2);
        paypink.registerArticle("interleave-b", 100, "h2");

        // Payment to creator A
        usdc.mint(address(paypink), 1000);
        vm.prank(x402Caller);
        paypink.recordX402Payment("interleave-a", reader, 1000);
        assertEq(paypink.totalRecorded(), 1000);

        // Creator A withdraws mid-stream
        vm.prank(author);
        paypink.withdrawTokens();
        assertEq(paypink.totalRecorded(), 10); // only platform share left from first payment

        // Payment to creator B — balance check must account for reduced totalRecorded
        usdc.mint(address(paypink), 2000);
        vm.prank(x402Caller);
        paypink.recordX402Payment("interleave-b", reader2, 2000);
        assertEq(paypink.totalRecorded(), 2010); // 10 (platform from A) + 2000 (B's payment)

        // Another payment to creator A (new article, different reader)
        vm.prank(author);
        paypink.registerArticle("interleave-a2", 100, "h3");
        usdc.mint(address(paypink), 500);
        vm.prank(x402Caller);
        paypink.recordX402Payment("interleave-a2", reader3, 500);

        // Creator A: 495 (from second article only, first was withdrawn)
        assertEq(paypink.creatorTokenBalances(author), 495);
        // Creator B: 1980
        assertEq(paypink.creatorTokenBalances(author2), 1980);

        // Everyone withdraws
        vm.prank(author);
        paypink.withdrawTokens();
        vm.prank(author2);
        paypink.withdrawTokens();
        vm.prank(deployer);
        paypink.withdrawPlatformTokenFees();

        assertEq(usdc.balanceOf(address(paypink)), 0);
        assertEq(paypink.totalRecorded(), 0);
    }

    /// @dev 10 sequential payments from 10 readers, one batch withdrawal.
    function test_WithdrawTokens_ManyPaymentsBatchWithdraw() public {
        vm.prank(author);
        paypink.registerArticle("popular", 100, "h");

        uint256 paymentAmount = 1000;
        uint256 numReaders = 10;

        for (uint256 i = 0; i < numReaders; i++) {
            address r = makeAddr(string(abi.encodePacked("reader-", vm.toString(i))));
            usdc.mint(address(paypink), paymentAmount);
            vm.prank(x402Caller);
            paypink.recordX402Payment("popular", r, paymentAmount);
        }

        // Creator accumulated: 990 * 10 = 9900
        assertEq(paypink.creatorTokenBalances(author), 9900);
        // Platform accumulated: 10 * 10 = 100
        assertEq(paypink.platformTokenBalance(), 100);
        assertEq(paypink.totalRecorded(), 10000);

        vm.prank(author);
        paypink.withdrawTokens();
        assertEq(usdc.balanceOf(author), 9900);

        vm.prank(deployer);
        paypink.withdrawPlatformTokenFees();
        assertEq(usdc.balanceOf(deployer), 100);

        assertEq(usdc.balanceOf(address(paypink)), 0);
        assertEq(paypink.totalRecorded(), 0);

        Paypink.Article memory article = paypink.getArticle("popular");
        assertEq(article.views, 10);
        assertEq(article.earned, 10000);
    }

    /// @dev Rounding dust: amounts where amount/100 * 100 != amount.
    ///      Total split must still equal totalRecorded after all withdrawals.
    function test_WithdrawTokens_RoundingDustInvariant() public {
        address reader2 = makeAddr("reader2");
        address reader3 = makeAddr("reader3");

        vm.prank(author);
        paypink.registerArticle("dust", 100, "h");

        // Awkward amounts that produce rounding dust: 1, 99, 101
        uint256[3] memory amounts = [uint256(1), uint256(99), uint256(101)];
        address[3] memory readers = [reader, reader2, reader3];

        uint256 totalMinted;
        for (uint256 i = 0; i < 3; i++) {
            usdc.mint(address(paypink), amounts[i]);
            vm.prank(x402Caller);
            paypink.recordX402Payment("dust", readers[i], amounts[i]);
            totalMinted += amounts[i];
        }

        // Invariant: creatorTokenBalances + platformTokenBalance == totalRecorded == totalMinted
        uint256 creatorBal = paypink.creatorTokenBalances(author);
        uint256 platformBal = paypink.platformTokenBalance();
        assertEq(creatorBal + platformBal, paypink.totalRecorded());
        assertEq(paypink.totalRecorded(), totalMinted);

        // Withdraw everything
        vm.prank(author);
        paypink.withdrawTokens();
        if (platformBal > 0) {
            vm.prank(deployer);
            paypink.withdrawPlatformTokenFees();
        }

        assertEq(usdc.balanceOf(address(paypink)), 0);
        assertEq(paypink.totalRecorded(), 0);
    }

    // --- Story 2-4: Platform Fee Withdrawal (edge cases) ---

    /// @dev Platform fees from multiple articles by different creators, one withdrawal.
    function test_WithdrawPlatformTokenFees_MultiCreatorAccumulation() public {
        address author2 = makeAddr("author2");
        address reader2 = makeAddr("reader2");

        vm.prank(author);
        paypink.registerArticle("plat-a", 100, "h1");
        vm.prank(author2);
        paypink.registerArticle("plat-b", 100, "h2");

        usdc.mint(address(paypink), 1000);
        vm.prank(x402Caller);
        paypink.recordX402Payment("plat-a", reader, 1000);

        usdc.mint(address(paypink), 5000);
        vm.prank(x402Caller);
        paypink.recordX402Payment("plat-b", reader2, 5000);

        // Platform accumulated: 10 + 50 = 60
        assertEq(paypink.platformTokenBalance(), 60);

        vm.prank(deployer);
        paypink.withdrawPlatformTokenFees();
        assertEq(usdc.balanceOf(deployer), 60);
        assertEq(paypink.platformTokenBalance(), 0);
    }

    /// @dev Platform withdraws, more payments come in, platform withdraws again.
    function test_WithdrawPlatformTokenFees_WithdrawEarnWithdrawAgain() public {
        address reader2 = makeAddr("reader2");

        vm.prank(author);
        paypink.registerArticle("plat-cycle", 100, "h");

        // First payment + platform withdrawal
        usdc.mint(address(paypink), 1000);
        vm.prank(x402Caller);
        paypink.recordX402Payment("plat-cycle", reader, 1000);

        vm.prank(deployer);
        paypink.withdrawPlatformTokenFees();
        assertEq(usdc.balanceOf(deployer), 10);

        // Second payment + platform withdrawal
        usdc.mint(address(paypink), 2000);
        vm.prank(x402Caller);
        paypink.recordX402Payment("plat-cycle", reader2, 2000);

        vm.prank(deployer);
        paypink.withdrawPlatformTokenFees();
        assertEq(usdc.balanceOf(deployer), 30); // 10 + 20
    }

    /// @dev Platform withdraws first, then creator — order shouldn't matter. Contract drains fully.
    function test_WithdrawOrder_PlatformFirst() public withArticle withX402Payment("article-slug", reader, 1000) {
        // Platform first
        vm.prank(deployer);
        paypink.withdrawPlatformTokenFees();
        assertEq(usdc.balanceOf(deployer), 10);
        assertEq(paypink.totalRecorded(), 990);

        // Then creator
        vm.prank(author);
        paypink.withdrawTokens();
        assertEq(usdc.balanceOf(author), 990);
        assertEq(paypink.totalRecorded(), 0);
        assertEq(usdc.balanceOf(address(paypink)), 0);
    }

    /// @dev Platform withdraws between two creator payments — totalRecorded stays consistent.
    function test_WithdrawPlatformTokenFees_BetweenCreatorPayments() public {
        address reader2 = makeAddr("reader2");

        vm.prank(author);
        paypink.registerArticle("mid-plat", 100, "h");

        // First payment
        usdc.mint(address(paypink), 1000);
        vm.prank(x402Caller);
        paypink.recordX402Payment("mid-plat", reader, 1000);

        // Platform withdraws its 10
        vm.prank(deployer);
        paypink.withdrawPlatformTokenFees();
        assertEq(paypink.totalRecorded(), 990); // creator share remains

        // Second payment — balance check: balanceOf(1000-10+2000=2990) - totalRecorded(990) = 2000 >= 2000
        usdc.mint(address(paypink), 2000);
        vm.prank(x402Caller);
        paypink.recordX402Payment("mid-plat", reader2, 2000);

        assertEq(paypink.totalRecorded(), 2990); // 990 + 2000

        // Final drain
        vm.prank(author);
        paypink.withdrawTokens(); // 990 + 1980 = 2970
        vm.prank(deployer);
        paypink.withdrawPlatformTokenFees(); // 20

        assertEq(usdc.balanceOf(address(paypink)), 0);
        assertEq(paypink.totalRecorded(), 0);
    }

    // --- Wild edge cases (both stories) ---

    /// @dev USDC has 6 decimals. Typical $5 article = 5_000000 (5e6).
    ///      Verify split and withdrawal work with realistic USDC amounts.
    function test_WithdrawTokens_RealisticUSDC6Decimals() public {
        vm.prank(author);
        paypink.registerArticle("real-usdc", 100, "h");

        uint256 fiveDollars = 5_000000; // 5 USDC (6 decimals)
        usdc.mint(address(paypink), fiveDollars);
        vm.prank(x402Caller);
        paypink.recordX402Payment("real-usdc", reader, fiveDollars);

        // 5_000000 / 100 = 50000 platform, 5_000000 - 50000 = 4_950000 creator
        assertEq(paypink.creatorTokenBalances(author), 4_950000);
        assertEq(paypink.platformTokenBalance(), 50000);

        vm.prank(author);
        paypink.withdrawTokens();
        assertEq(usdc.balanceOf(author), 4_950000);

        vm.prank(deployer);
        paypink.withdrawPlatformTokenFees();
        assertEq(usdc.balanceOf(deployer), 50000);

        assertEq(usdc.balanceOf(address(paypink)), 0);
    }

    /// @dev Large amount near the edge — verify no overflow in split math.
    ///      type(uint256).max / 100 is the max safe payment before platformShare overflows.
    function test_WithdrawTokens_LargeAmount_NoOverflow() public {
        vm.prank(author);
        paypink.registerArticle("whale", 100, "h");

        // Max safe amount: type(uint256).max / 100 (so amount / 100 doesn't overflow nearby math)
        uint256 largeAmount = type(uint128).max; // 2^128 - 1, plenty large, no overflow risk
        usdc.mint(address(paypink), largeAmount);
        vm.prank(x402Caller);
        paypink.recordX402Payment("whale", reader, largeAmount);

        uint256 expectedPlatform = largeAmount / 100;
        uint256 expectedCreator = largeAmount - expectedPlatform;
        assertEq(paypink.creatorTokenBalances(author), expectedCreator);
        assertEq(paypink.platformTokenBalance(), expectedPlatform);
        assertEq(expectedCreator + expectedPlatform, largeAmount); // no dust lost

        vm.prank(author);
        paypink.withdrawTokens();
        assertEq(usdc.balanceOf(author), expectedCreator);

        vm.prank(deployer);
        paypink.withdrawPlatformTokenFees();
        assertEq(usdc.balanceOf(deployer), expectedPlatform);

        assertEq(usdc.balanceOf(address(paypink)), 0);
        assertEq(paypink.totalRecorded(), 0);
    }

    /// @dev Creator A withdraws, then a new payment comes in for creator B.
    ///      The balance check must use the updated totalRecorded (post-withdrawal).
    function test_BalanceCheck_AfterPartialWithdrawal() public {
        address author2 = makeAddr("author2");

        vm.prank(author);
        paypink.registerArticle("check-a", 100, "h1");
        vm.prank(author2);
        paypink.registerArticle("check-b", 100, "h2");

        // Payment of 1000 to creator A
        usdc.mint(address(paypink), 1000);
        vm.prank(x402Caller);
        paypink.recordX402Payment("check-a", reader, 1000);

        // Creator A withdraws 990 → contract holds 10 USDC, totalRecorded = 10
        vm.prank(author);
        paypink.withdrawTokens();
        assertEq(usdc.balanceOf(address(paypink)), 10);
        assertEq(paypink.totalRecorded(), 10);

        // available = balanceOf(10) - totalRecorded(10) = 0
        // Payment of 500 to creator B should fail without new tokens
        vm.prank(x402Caller);
        vm.expectRevert(Paypink.Paypink__InsufficientTokenBalance.selector);
        paypink.recordX402Payment("check-b", reader, 500);

        // Mint tokens for the new payment — now it should work
        usdc.mint(address(paypink), 500);
        vm.prank(x402Caller);
        paypink.recordX402Payment("check-b", reader, 500);

        assertEq(paypink.creatorTokenBalances(author2), 495);
    }

    /// @dev ETH payment and USDC payment coexist on the same article without interference.
    ///      Creator can withdraw ETH and USDC independently.
    function test_WithdrawTokens_ETHAndUSDCCoexist() public {
        address ethReader = makeAddr("ethReader");
        address usdcReader = makeAddr("usdcReader");

        // Register with a realistic $10 price (18 decimals) so ETH payment is non-zero
        vm.prank(author);
        paypink.registerArticle("dual-rail", 10e18, "h");

        // ETH payment: $10 at $2000/ETH = 0.005 ETH
        vm.deal(ethReader, 1 ether);
        vm.prank(ethReader);
        paypink.payForArticle{value: 0.005 ether}("dual-rail");

        // USDC payment
        usdc.mint(address(paypink), 1000);
        vm.prank(x402Caller);
        paypink.recordX402Payment("dual-rail", usdcReader, 1000);

        // Both readers have paid
        bytes32 key = keccak256(abi.encodePacked("dual-rail"));
        assertTrue(paypink.hasPaid(key, ethReader));
        assertTrue(paypink.hasPaid(key, usdcReader));

        // ETH balances (creatorBalances) and token balances (creatorTokenBalances) are separate
        assertTrue(paypink.creatorBalances(author) > 0);
        assertEq(paypink.creatorTokenBalances(author), 990);

        // Withdraw ETH
        uint256 ethBal = paypink.creatorBalances(author);
        vm.prank(author);
        paypink.withdraw();
        assertEq(author.balance, ethBal);
        assertEq(paypink.creatorBalances(author), 0);
        // Token balance unaffected
        assertEq(paypink.creatorTokenBalances(author), 990);

        // Withdraw USDC
        vm.prank(author);
        paypink.withdrawTokens();
        assertEq(usdc.balanceOf(author), 990);
        assertEq(paypink.creatorTokenBalances(author), 0);
    }

    /// @dev Zero-amount x402 payment: marks reader as paid but credits nothing.
    ///      Both creator and platform have zero token balances — neither can withdraw.
    function test_RecordX402Payment_ZeroAmount_MarksAsPaidButCreditsNothing() public withArticle {
        usdc.mint(address(paypink), 0); // no-op, just for clarity
        vm.prank(x402Caller);
        paypink.recordX402Payment("article-slug", reader, 0);

        bytes32 key = keccak256(abi.encodePacked("article-slug"));
        assertTrue(paypink.hasPaid(key, reader));
        assertEq(paypink.creatorTokenBalances(author), 0);
        assertEq(paypink.platformTokenBalance(), 0);
        assertEq(paypink.totalRecorded(), 0);

        // Neither side can withdraw
        vm.prank(author);
        vm.expectRevert(Paypink.Paypink__NothingToWithdraw.selector);
        paypink.withdrawTokens();

        vm.prank(deployer);
        vm.expectRevert(Paypink.Paypink__NothingToWithdraw.selector);
        paypink.withdrawPlatformTokenFees();
    }

    /// @dev Same reader pays for two different articles by the same creator.
    ///      Creator earnings accumulate correctly, hasPaid is per-article.
    function test_WithdrawTokens_SameReaderTwoArticles() public {
        vm.startPrank(author);
        paypink.registerArticle("multi-a", 100, "h1");
        paypink.registerArticle("multi-b", 100, "h2");
        vm.stopPrank();

        usdc.mint(address(paypink), 1000);
        vm.prank(x402Caller);
        paypink.recordX402Payment("multi-a", reader, 1000);

        usdc.mint(address(paypink), 2000);
        vm.prank(x402Caller);
        paypink.recordX402Payment("multi-b", reader, 2000);

        // Reader paid for both
        assertTrue(paypink.hasPaid(keccak256(abi.encodePacked("multi-a")), reader));
        assertTrue(paypink.hasPaid(keccak256(abi.encodePacked("multi-b")), reader));

        // Creator accumulated: 990 + 1980 = 2970
        assertEq(paypink.creatorTokenBalances(author), 2970);

        vm.prank(author);
        paypink.withdrawTokens();
        assertEq(usdc.balanceOf(author), 2970);
    }

    /// @dev Stranger (non-creator with zero balance) tries to withdraw tokens — should revert.
    function test_WithdrawTokens_StrangerReverts() public {
        vm.prank(stranger);
        vm.expectRevert(Paypink.Paypink__NothingToWithdraw.selector);
        paypink.withdrawTokens();
    }

    /// @dev Fuzz: for any payment amount > 0, the split invariant holds and both sides can withdraw.
    function testFuzz_WithdrawTokens_SplitInvariant(uint256 amount) public {
        amount = bound(amount, 1, type(uint128).max);

        vm.prank(author);
        paypink.registerArticle("fuzz", 100, "h");

        usdc.mint(address(paypink), amount);
        vm.prank(x402Caller);
        paypink.recordX402Payment("fuzz", reader, amount);

        uint256 creatorBal = paypink.creatorTokenBalances(author);
        uint256 platformBal = paypink.platformTokenBalance();

        // Invariant: no tokens lost or created in the split
        assertEq(creatorBal + platformBal, amount);
        assertEq(paypink.totalRecorded(), amount);

        // Both can withdraw
        if (creatorBal > 0) {
            vm.prank(author);
            paypink.withdrawTokens();
            assertEq(usdc.balanceOf(author), creatorBal);
        }
        if (platformBal > 0) {
            vm.prank(deployer);
            paypink.withdrawPlatformTokenFees();
            assertEq(usdc.balanceOf(deployer), platformBal);
        }

        assertEq(usdc.balanceOf(address(paypink)), 0);
        assertEq(paypink.totalRecorded(), 0);
    }

    // --- Integration: x402 full flow ---

    function test_FullX402Flow_PayRecordWithdraw() public {
        // Register article
        vm.prank(author);
        paypink.registerArticle("paid-article", 500, "hash123");

        // Facilitator settles tokens into contract, then backend records the payment
        usdc.mint(address(paypink), 500);
        vm.prank(x402Caller);
        paypink.recordX402Payment("paid-article", reader, 500);

        // Verify state
        bytes32 key = keccak256(abi.encodePacked("paid-article"));
        assertTrue(paypink.hasPaid(key, reader));
        assertEq(paypink.creatorTokenBalances(author), 495);
        assertEq(paypink.platformTokenBalance(), 5);
        assertEq(paypink.totalRecorded(), 500);

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
        assertEq(paypink.totalRecorded(), 0);
    }

    /// @dev Mega integration: 3 creators, 5 readers, interleaved payments and withdrawals.
    function test_FullX402Flow_MultiCreatorMultiReaderChaos() public {
        address author2 = makeAddr("author2");
        address author3 = makeAddr("author3");

        vm.prank(author);
        paypink.registerArticle("chaos-1", 100, "h1");
        vm.prank(author2);
        paypink.registerArticle("chaos-2", 100, "h2");
        vm.prank(author3);
        paypink.registerArticle("chaos-3", 100, "h3");

        uint256 totalPaid;

        // Reader 0 pays for chaos-1 (1000)
        usdc.mint(address(paypink), 1000);
        vm.prank(x402Caller);
        paypink.recordX402Payment("chaos-1", makeAddr("r0"), 1000);
        totalPaid += 1000;

        // Reader 1 pays for chaos-2 (2000)
        usdc.mint(address(paypink), 2000);
        vm.prank(x402Caller);
        paypink.recordX402Payment("chaos-2", makeAddr("r1"), 2000);
        totalPaid += 2000;

        // Author 1 withdraws mid-stream
        vm.prank(author);
        paypink.withdrawTokens();
        assertEq(usdc.balanceOf(author), 990);

        // Reader 2 pays for chaos-3 (3000)
        usdc.mint(address(paypink), 3000);
        vm.prank(x402Caller);
        paypink.recordX402Payment("chaos-3", makeAddr("r2"), 3000);
        totalPaid += 3000;

        // Platform withdraws mid-stream
        vm.prank(deployer);
        paypink.withdrawPlatformTokenFees();
        // Platform had: 10 + 20 + 30 = 60
        assertEq(usdc.balanceOf(deployer), 60);

        // Reader 3 pays for chaos-1 (different reader, same article)
        usdc.mint(address(paypink), 500);
        vm.prank(x402Caller);
        paypink.recordX402Payment("chaos-1", makeAddr("r3"), 500);
        totalPaid += 500;

        // Reader 4 pays for chaos-2
        usdc.mint(address(paypink), 750);
        vm.prank(x402Caller);
        paypink.recordX402Payment("chaos-2", makeAddr("r4"), 750);
        totalPaid += 750;

        // Everyone withdraws remaining
        vm.prank(author);
        paypink.withdrawTokens(); // 495 from second payment
        vm.prank(author2);
        paypink.withdrawTokens(); // 1980 + 743 = 2723
        vm.prank(author3);
        paypink.withdrawTokens(); // 2970
        vm.prank(deployer);
        paypink.withdrawPlatformTokenFees(); // 5 + 7 = 12

        // Full drain
        assertEq(usdc.balanceOf(address(paypink)), 0);
        assertEq(paypink.totalRecorded(), 0);

        // Per-actor final balances (catches cross-actor leaks that aggregate checks miss)
        assertEq(usdc.balanceOf(author), 990 + 495); // 1485
        assertEq(usdc.balanceOf(author2), 1980 + 743); // 2723
        assertEq(usdc.balanceOf(author3), 2970);
        assertEq(usdc.balanceOf(deployer), 60 + 12); // 72

        // Aggregate invariant: total withdrawn == total paid
        uint256 totalWithdrawn = usdc.balanceOf(author) + usdc.balanceOf(author2) + usdc.balanceOf(author3)
            + usdc.balanceOf(deployer);
        assertEq(totalWithdrawn, totalPaid);
    }
}
