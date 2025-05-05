# Celystik Hub Deployment Guide

This document provides detailed instructions for deploying the Celystik Hub contracts to various networks.

## Prerequisites

Before deploying, ensure you have the following:

- Node.js (v14+) and npm installed
- Hardhat installed (`npm install --save-dev hardhat`)
- Required dependencies installed (`npm install`)
- A wallet with sufficient funds for the target network
- API keys configured for the target network (if needed)

## Configuration

1. Configure your network settings in `hardhat.config.js`:

```javascript
// Example hardhat.config.js
require('@nomiclabs/hardhat-ethers');
require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-etherscan'); // For verification

module.exports = {
  solidity: "0.8.4",
  networks: {
    mainnet: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: [process.env.PRIVATE_KEY],
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: [process.env.PRIVATE_KEY],
    },
    polygon: {
      url: `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: [process.env.PRIVATE_KEY],
    },
    // Add other networks as needed
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};
```

2. Set up environment variables (create a `.env` file):

```
PRIVATE_KEY=your_private_key_here
INFURA_API_KEY=your_infura_api_key_here
ETHERSCAN_API_KEY=your_etherscan_api_key_here
```

## Deployment Options

The Celystik Hub platform offers two deployment architectures:

1. **Direct Contract Usage (Recommended)**: Each contract is deployed independently and interacts directly with others. This provides better separation of concerns and gas efficiency.

2. **Factory-based Architecture (Legacy)**: All interactions are routed through the CelyHubFactory contract.

## Deployment Process

### Option 1: Automated Deployment (Recommended)

Use the provided deployment script which handles deploying all contracts in the correct order:

```bash
npx hardhat run scripts/deploy_all.js --network <network_name>
```

This script will:
- Deploy CEL Token
- Deploy Protocol Treasury
- Deploy Innovation Units
- Deploy Project Staking
- Deploy Emission Controller
- Set up permissions and connections between contracts
- Optionally deploy Factory (if enabled in the script)
- Create a test project (on development networks)

### Option 2: Manual Step-by-Step Deployment

If you prefer to deploy contracts individually:

1. Deploy CEL Token:
```bash
npx hardhat run scripts/deploy_cel_token.js --network <network_name>
```

2. Deploy Protocol Treasury:
```bash
npx hardhat run scripts/deploy_protocol_treasury.js --network <network_name>
```

3. Deploy Innovation Units:
```bash
npx hardhat run scripts/deploy_innovation_units.js --network <network_name>
```

4. Deploy Project Staking:
```bash
npx hardhat run scripts/deploy_project_staking.js --network <network_name>
```

5. Deploy Emission Controller:
```bash
npx hardhat run scripts/deploy_emission_controller.js --network <network_name>
```

6. (Optional) Deploy CelyHub Factory:
```bash
npx hardhat run scripts/deploy_factory.js --network <network_name>
```

## Verifying Deployment

After deployment, verify that all contracts are properly connected using the verification script:

```bash
npx hardhat run scripts/verify_deployment.js --network <network_name> <cel_token> <protocol_treasury> <innovation_units> <project_staking> <emission_controller> [cely_hub_factory]
```

Example:
```bash
npx hardhat run scripts/verify_deployment.js --network goerli 0x1234... 0x5678... 0x9abc... 0xdef0... 0x1234... 0x5678...
```

## Contract Verification on Etherscan

After deployment, verify your contracts on Etherscan (or equivalent explorer):

```bash
npx hardhat verify --network <network_name> <contract_address> <constructor_args>
```

Example for CEL Token:
```bash
npx hardhat verify --network goerli 0x1234... "Celystik Token" "CEL" "1000000000000000000000000000"
```

Example for Protocol Treasury:
```bash
npx hardhat verify --network goerli 0x5678... "0x1234..."
```

## Project Creation and Token Distribution

The Innovation Units contract features a permission model that enables:

1. **Any user can create projects**: Creating a project now does not require owner permissions, allowing any user to launch their own project.

2. **Automatic creator token minting**: When a project is created, the specified allocation for creators is automatically minted and distributed based on the creator shares.

3. **Creator-only contributor minting**: Only registered project creators can mint tokens to contributors. This ensures that:
   - Contributors are only rewarded by actual project creators
   - Contributor tokens can only be minted within the allocated contributor reserve
   - Different projects' creators cannot mint tokens for contributors of other projects

Example of creating a project:

```javascript
// Define project parameters
const totalSupply = ethers.utils.parseEther("1000000"); // 1M total supply
const initialPrice = ethers.utils.parseEther("0.01"); // 0.01 CEL initial price
const creators = [creator1Address, creator2Address, creator3Address]; 
const creatorShares = [5000, 3000, 2000]; // 50%, 30%, 20% distribution (must total 10000)
const creatorsAllocation = 6000; // 60% to creators
const contributorsAllocation = 2000; // 20% to contributors
const investorsAllocation = 2000; // 20% to investors

// Create project - any account can call this
const projectId = await innovationUnits.createProject(
  totalSupply,
  initialPrice,
  creators,
  creatorShares,
  creatorsAllocation,
  contributorsAllocation,
  investorsAllocation
);

// The creator tokens are automatically minted during creation
console.log(`Project created with ID: ${projectId}`);

// Later, any creator can mint tokens to contributors
await innovationUnits.mintToContributor(
  projectId, 
  contributorAddress,
  contributorTokenAmount
);
```

## Post-Deployment Setup

After deploying all contracts, you'll need to:

1. **Set up permissions**:
   - Grant minter role to Emission Controller in CEL Token
   - Set Emission Controller in Project Staking

2. **Initialize contracts** (if not done during deployment):
   - Initialize InnovationUnits with CEL Token and Treasury addresses

3. **Create initial projects**:
   - Use the InnovationUnits contract's createProject function
   - Creator tokens will be automatically minted based on the specified shares

4. **Configure parameters**:
   - Set fee percentages in InnovationUnits
   - Set emission parameters in EmissionController
   - Configure staking parameters in ProjectStaking

## Deployment Considerations

### Gas Costs

Deploying the full Celystik Hub ecosystem requires significant gas, particularly on Ethereum mainnet. Estimated costs:
- CEL Token: ~2.5M gas
- Protocol Treasury: ~1M gas
- Innovation Units: ~4M gas
- Project Staking: ~3M gas
- Emission Controller: ~3M gas
- CelyHub Factory (optional): ~3M gas

### Security

After deployment:
- Verify ownership of all contracts
- Ensure proper permissions are set
- Lock liquidity if needed
- Consider using timelock for critical functions
- Consider a multisig as the contract owner

## Upgrading Contracts

The current implementation doesn't use proxy patterns, so upgrades will require new deployments. Consider implementing an upgrade strategy if needed:

1. **Standard Upgrade**: Deploy new contracts, migrate state, and update references
2. **Proxy Pattern**: Implement proxy contracts for upgradability
3. **Side-by-side Deployment**: Deploy new version alongside old one with a migration path

## Troubleshooting

### Common Issues

1. **Insufficient Gas**: Increase gas limit for complex contract deployments
2. **Nonce Issues**: Reset nonce if transactions fail
3. **Initialization Failures**: Ensure prerequisites are met before initializing contracts
4. **Permission Errors**: Verify the deploying account has necessary roles
5. **Project Creation Issues**: Ensure creator shares total exactly 100% (10000 basis points)
6. **Contributor Minting Issues**: Verify the minting account is a registered creator for the project

### Getting Help

If you encounter issues:
1. Check error messages in console output
2. Review contract requirements and dependencies
3. Reach out to the development team 