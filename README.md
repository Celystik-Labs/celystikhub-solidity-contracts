# Celystik Hub Smart Contracts

This repository contains the smart contracts for the Celystik Hub platform, which facilitates decentralized collaboration on projects and task management.

## Features

- CEL token for platform governance and utility
- Project creation and management
- Task assignment and completion
- Token staking mechanisms
- Reputation system

## Prerequisites

- Node.js (v14+)
- npm or yarn

## Setup

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

## Development

### Compile Contracts
```bash
npx hardhat compile
```

### Run Tests
```bash
npx hardhat test
```

### Local Deployment
```bash
npx hardhat node
npx hardhat run --network localhost scripts/deploy.js
```

## Contract Architecture

- `CelystikToken.sol` - ERC20 token for the platform
- `ProjectRegistry.sol` - Manages project creation and metadata
- `TaskManager.sol` - Handles task creation, assignment, and completion
- `StakingPool.sol` - Manages token staking for projects
- `ReputationSystem.sol` - Tracks user reputation based on contributions

## License

MIT 