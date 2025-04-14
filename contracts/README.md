# Celystik Hub Smart Contracts

This directory contains the smart contracts for the Celystik Hub platform, which enable the tokenized project ecosystem with staking, rewards, and task management.

## Contract Architecture

The Celystik Hub smart contract system consists of four main contracts:

1. **CELToken** - The platform's utility token
2. **EmissionController** - Manages token emissions based on PoI scores
3. **InnovationUnits** - Handles project-specific tokens (IUs)
4. **Staking** - Manages token staking on projects

Here's a diagram showing how these contracts interact:

```
[ IU Contract ] -----> IU Holdings ----┐
[ Staking Contract ] --> Stake Info ---├--> [ EmissionController ] --> [ CEL Token ]
[ PoI Oracle ] --------------------------┘
```

## Contracts

### CELToken

A standard ERC-20 token with additional features:
- Minting with role-based access control
- Burning capability
- Pausable transfers
- Maximum supply cap

The CEL token is used for staking, governance, and as the main currency in the platform.

### EmissionController

This contract controls the emission of CEL tokens based on:
- Project staking amounts
- IU holdings
- PoI (Proof of Impact) scores

It implements the formula:
```
E_i = (S_i^α × I_i^β) / Σ(S_j^α × I_j^β)
```
where:
- E_i = Emissions for project i
- S_i = Staking weight for project i
- I_i = IU weight for project i
- α = Staking weight factor
- β = IU weight factor

The EmissionController calculates and distributes rewards to both stakers and IU holders.

### InnovationUnits (IU)

This contract manages project-specific tokens that represent ownership in projects. Features:
- Project creation with configurable supply and distribution
- Allocation to creators, contributors, and investors
- Price-based purchase mechanism
- Ownership tracking

Each project has its own IUs with different allocations for:
- Project creators (ownership share)
- Contributors (for completing tasks)
- Investors (purchasing with CEL tokens)

### Staking

This contract allows users to stake CEL tokens on projects they believe in:
- Staking and unstaking functionality
- Minimum staking periods
- Stake limits per project
- Staking share calculation

Users stake CEL tokens on projects to show support and earn rewards through the EmissionController.

## Contract Interactions

1. A project is created with a total supply of IUs, allocated between creators, contributors, and investors
2. Users can stake CEL tokens on projects they believe in
3. Contributors complete tasks and receive IUs as rewards
4. Investors can purchase IUs using CEL tokens
5. The EmissionController calculates rewards based on staking amounts and IU holdings
6. Rewards are distributed to stakers and IU holders

## Deployment

To deploy these contracts:

1. Deploy the CEL token
2. Deploy the EmissionController with the CEL token address
3. Deploy the InnovationUnits contract with the CEL token address
4. Deploy the Staking contract with the CEL token address
5. Grant minting permission to EmissionController
6. Transfer ownership of InnovationUnits and Staking to EmissionController

Use the `scripts/deploy.js` script to deploy all contracts at once.

## Testing

Use the Hardhat testing framework to run the tests:

```bash
npx hardhat test
``` 