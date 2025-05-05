# Transitioning to Direct Contract Usage

This guide explains how to transition from using the CelyHubFactory as an intermediary to directly interacting with the core contracts in the Celystik Hub ecosystem.

## New Architecture Overview

The InnovationUnits contract has been enhanced to include all necessary functionality for direct interaction, eliminating the need for the Factory contract as an intermediary. This provides several benefits:

1. **Simplified Architecture**: Fewer contract interactions mean lower gas costs and a cleaner codebase
2. **Direct Control**: No middle layer between users and core functionality
3. **Better Separation of Concerns**: Each contract focuses on its specific role

## Key Changes

The InnovationUnits contract now includes:

1. **Treasury Management**: Project-specific treasury balances are tracked directly within InnovationUnits
2. **Direct Buy/Sell Functions**: Users can buy and sell IUs directly with the contract
3. **Liquidity Management**: Functions to add and remove liquidity from project treasuries
4. **CEL Token Integration**: Direct handling of CEL token transfers

## How to Use Directly

### Checking Readiness

Before interacting directly with InnovationUnits, check if it's properly initialized:

```solidity
(bool isReady, string memory missingComponent) = innovationUnits.isReadyForDirectUse();
require(isReady, missingComponent);
```

### Buying IUs

```solidity
// 1. Approve CEL tokens for InnovationUnits contract
celToken.approve(address(innovationUnits), amount);

// 2. Buy IUs directly
(uint256 totalCost, uint256 feePaid) = innovationUnits.buyIUs(projectId, amount);
```

### Selling IUs

```solidity
// Sell IUs directly
(uint256 amountReceived, uint256 feePaid) = innovationUnits.sellIUs(projectId, amount);
```

### Adding Liquidity to a Project

```solidity
// 1. Approve CEL tokens for InnovationUnits contract
celToken.approve(address(innovationUnits), amount);

// 2. Add liquidity
innovationUnits.addLiquidity(projectId, amount);
```

### Creating a Project

Project creation still requires owner permissions:

```solidity
// Only the contract owner can create projects
uint256 projectId = innovationUnits.createProject(
    totalSupply,
    initialPrice,
    creators,
    creatorShares,
    creatorsAllocation,
    contributorsAllocation,
    investorsAllocation
);
```

## Integration with Other Contracts

The InnovationUnits contract works seamlessly with:

1. **ProjectStaking**: For staking CEL tokens on projects
2. **EmissionController**: For emissions distribution

Each of these contracts can be used directly without going through the Factory.

## Benefits of Direct Interaction

1. **Gas Efficiency**: Fewer contract interactions means lower gas costs
2. **Transparency**: Clearer understanding of where funds are going
3. **Fault Isolation**: Issues in one contract don't affect others
4. **Simplicity**: Easier to reason about contract interactions

## Migration Strategy

To migrate from using the Factory:

1. Ensure InnovationUnits is initialized (check with `isReadyForDirectUse()`)
2. Update frontend applications to call InnovationUnits directly
3. Gradually phase out Factory contract interactions
4. Consider transferring ownership from Factory to a new governance address

## Backward Compatibility

All previous functionality through the Factory is still supported, allowing for a gradual transition.

## Security Considerations

When interacting directly:

1. Always check return values from contract calls
2. Verify token approvals are set correctly before transactions
3. Monitor treasury balances for adequate liquidity before selling IUs

## For Developers

When building new features:

1. Focus on enhancing core contracts directly
2. Consider upgradeability patterns for future improvements
3. Use events for tracking important state changes
4. Maintain comprehensive unit tests for direct interactions 