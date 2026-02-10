// https://www.getfoundry.sh/forge/testing
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {Paypink} from "../contracts/Paypink.sol";
import {console} from "forge-std/console.sol";

contract PaypinkTest is Test {
    address deployer = makeAddr("deployer");

    Paypink public paypink;

    function setUp() public {
        vm.prank(deployer);
        paypink = new Paypink();
    }

    function testCheckowner() public view {
        assertEq(paypink.owner(), deployer);
    }
}
