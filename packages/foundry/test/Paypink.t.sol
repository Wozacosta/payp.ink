// https://www.getfoundry.sh/forge/testing
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {Paypink} from "../contracts/Paypink.sol";
import {console} from "forge-std/console.sol";

contract PaypinkTest is Test {
    address deployer = makeAddr("deployer");
    address author = makeAddr("author");

    Paypink public paypink;

    function setUp() public {
        vm.prank(deployer);
        paypink = new Paypink();
    }

    function testCheckowner() public view {
        assertEq(paypink.owner(), deployer);
    }

    function test_RegisterArticle() public {
        vm.startPrank(author);
        // string calldata slug, uint256 price, string calldata contentHash
        paypink.registerArticle("article-slug", 1, "contentHashed");

        Paypink.Article memory newArticle = paypink.getArticle("article-slug");
        assertEq(newArticle.slug, "article-slug");
        assertEq(newArticle.price, 1);
        assertEq(newArticle.contentHash, "contentHashed");
        vm.stopPrank();
    }
}
