# Staking Guide for Celystik Hub

This guide explains how to stake CEL tokens on projects and unstake them using the provided scripts.

## Overview

In the Celystik Hub platform, users can stake CEL tokens on projects to:
- Show support for the project
- Earn staking rewards through the EmissionController
- Participate in the governance of the platform

The staking process involves locking CEL tokens for a specific duration (between 7 days and 2 years). The longer you lock your tokens, the higher your staking score will be, which affects your share of emissions.

## Understanding Stake Indexes

The Celystik Hub staking system allows users to have multiple active stakes per project. Each stake is identified by a unique index, which is needed when unstaking. This design enables:

- Staking multiple times with different lock durations
- Staking additional tokens without affecting existing stakes
- Unstaking specific positions while leaving others active

When you stake tokens, the transaction returns a unique stake index that you'll need to reference when unstaking those tokens later.

## Staking Workflow

1. **Check available CEL balance**
2. **Decide how much to stake and for how long**
3. **Approve the ProjectStaking contract to spend your CEL tokens**
4. **Execute the stake transaction**
5. **Note down the stake index returned in the event**
6. **Wait for the lock period to end**
7. **Unstake tokens using the stake index**

## Using the Scripts

### Staking Tokens

To stake CEL tokens on a project:

```bash
npx hardhat run scripts/interactions/stake.js
```

This script will:
- Approve the ProjectStaking contract to spend your CEL tokens
- Stake the specified amount for the specified lock duration
- Output the stake index that you'll need for unstaking

Parameters in the script (modify as needed):
- `projectId`: ID of the project to stake on
- `stakeAmount`: Amount of CEL tokens to stake
- `lockDurationDays`: Duration in days to lock tokens

### Getting Stake Indexes

If you need to retrieve your stake indexes (e.g., if you forgot them or want to check your active stakes):

```bash
npx hardhat run scripts/interactions/getStakeIndexes.js
```

This script will:
- Retrieve and display all your active stakes for a project
- Show detailed information about each stake
- Provide the exact command to use for unstaking each position

### Unstaking Tokens

To unstake CEL tokens from a project:

```bash
npx hardhat run scripts/interactions/unstake.js -- --project-id <PROJECT_ID> --stake-index <STAKE_INDEX>
```

Parameters:
- `<PROJECT_ID>`: ID of the project (default: 0)
- `<STAKE_INDEX>`: Index of the stake to unstake (required)

For example:
```bash
npx hardhat run scripts/interactions/unstake.js -- --project-id 0 --stake-index 2
```

This script will:
- Check if the stake is available for unstaking
- Execute the unstake transaction if the lock period has ended
- Transfer the staked CEL tokens back to your wallet

### Example Workflow

For a complete example that demonstrates the entire staking and unstaking process:

```bash
npx hardhat run scripts/interactions/stakeAndUnstakeExample.js
```

This script shows:
- How to stake tokens
- How to extract the stake index from the transaction receipt
- How to check if a stake can be unstaked
- How to unstake tokens using the stake index

## Important Considerations

1. **Lock Duration**: Once you stake tokens, they are locked for the specified duration and cannot be unstaked before the lock period ends.

2. **Stake Indexes**: Always keep track of your stake indexes, as they are required for unstaking.

3. **Multiple Stakes**: You can have multiple active stakes for the same project with different lock durations.

4. **Staking Score**: Your staking score is calculated based on both the amount staked and the lock duration. Longer lock periods result in higher scores, which can lead to higher emissions rewards.

5. **Emissions Distribution**: Staking rewards are distributed through the EmissionController during epoch processing. You can claim these rewards separately using the `claimStakingEmissions` function.

## Troubleshooting

If you encounter issues:

- **Cannot unstake tokens**: Check if the lock period has ended using the `getStakeIndexes.js` script.

- **Stake index not found**: Make sure you're using the correct project ID and stake index. Use the `getStakeIndexes.js` script to verify your active stakes.

- **Insufficient CEL balance for staking**: Ensure your wallet has enough CEL tokens and that you've approved the ProjectStaking contract to spend them.

- **Transaction errors**: Check the error message for specific details. Common issues include insufficient gas, incorrect parameters, or attempting to unstake before the lock period ends. 