// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/// @title AggregatorV3Interface
/// @notice Chainlink-compatible price feed interface. Works with any oracle that
///         implements the same function signatures (Redstone, eOracle, API3, etc.).
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function version() external view returns (uint256);

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}
