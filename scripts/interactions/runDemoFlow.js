const { getContracts, logTransaction, parseAmount, formatAmount } = require("./utils");
const { ethers, network } = require("hardhat");

async function main() {
  console.log("=== Celystik Hub Complete Demo Flow ===");
  
  // Get contract instances and signers
  const { 
    celToken, 
    protocolTreasury, 
    innovationUnits, 
    projectStaking, 
    emissionController, 
    signer 
  } = await getContracts();
  
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const creator2 = signers[1];
  const investor = signers[2];
  const contributor1 = signers[3];
  const contributor2 = signers[4];
  
  console.log(`\nAccounts:`);
  console.log(`- Deployer/Creator1: ${deployer.address}`);
  console.log(`- Creator2: ${creator2.address}`);
  console.log(`- Investor: ${investor.address}`);
  console.log(`- Contributor1: ${contributor1.address}`);
  console.log(`- Contributor2: ${contributor2.address}`);
  
  try {
    // Mint some CEL tokens to the participants
    console.log(`\n1. Minting CEL tokens to participants...`);
    
    const mintAmount = parseAmount("10000"); // 10,000 CEL tokens
    
    await (await celToken.mint(deployer.address, mintAmount)).wait();
    await (await celToken.mint(creator2.address, mintAmount)).wait();
    await (await celToken.mint(investor.address, mintAmount)).wait();
    
    console.log(`Minted ${formatAmount(mintAmount)} CEL to each participant`);
    
    // Step 1: Create a Project
    console.log(`\n2. Creating a new project...`);
    
    const totalSupply = parseAmount("1000000"); // 1M total supply
    const initialPrice = parseAmount("0.01");   // 0.01 CEL initial price
    const creators = [deployer.address, creator2.address];
    const creatorShares = [7000, 3000]; // 70% to deployer, 30% to creator2
    const creatorAllocation = 5000;    // 50% to creators
    const contributorAllocation = 3000; // 30% to contributors
    const investorAllocation = 2000;    // 20% to investors
    
    let projectId = 0; // Default to 0 if we can't extract
    
    try {
      const createTx = await innovationUnits.createProject(
        totalSupply,
        initialPrice,
        creators,
        creatorShares,
        creatorAllocation,
        contributorAllocation,
        investorAllocation
      );
      
      console.log("Create project transaction submitted:", createTx.hash);
      
      const createReceipt = await createTx.wait();
      console.log("Transaction confirmed in block:", createReceipt.blockNumber);
      
      console.log("\nTransaction logs:", 
        createReceipt.logs && createReceipt.logs.length > 0 
          ? createReceipt.logs.map(log => ({
              address: log.address,
              topics: log.topics,
            }))
          : "No logs found"
      );
      
      console.log("\nEvents found:", 
        createReceipt.events && createReceipt.events.length > 0
          ? createReceipt.events.map(e => ({
              event: e.event,
              args: e.args ? Object.keys(e.args).map(k => k) : 'No args'
            }))
          : "No events found"
      );
      
      // Find the ProjectRegistered event and extract the projectId
      const projectRegisteredEvent = createReceipt.events && createReceipt.events.find(event => 
        event && event.event === "ProjectRegistered"
      );
      
      if (!projectRegisteredEvent) {
        console.log("ProjectRegistered event not found in transaction receipt");
        console.log("Available events:", 
          createReceipt.events && createReceipt.events.length > 0 
            ? createReceipt.events.map(e => e.event).filter(Boolean) 
            : "None"
        );
        
        if (createReceipt.logs && createReceipt.logs.length > 0 && createReceipt.logs[0].topics && createReceipt.logs[0].topics.length > 1) {
          console.log("Checking raw logs for event signature...");
          // Alternative: get projectId from the first indexed parameter of the first relevant log
          const projectIdHex = createReceipt.logs[0].topics[1];
          console.log(`Extracted projectId from logs: ${projectIdHex} (decimal: ${parseInt(projectIdHex, 16)})`);
          // Use decimal representation
          projectId = parseInt(projectIdHex, 16);
        } else {
          console.log("No suitable logs found. Using default projectId: 0");
          projectId = 0;
        }
      } else {
        projectId = projectRegisteredEvent.args.projectId;
      }
      
      console.log(`Project created successfully with ID: ${projectId}`);
    } catch (error) {
      console.error("Error creating project:", error);
      console.log("Continuing with default projectId: 0");
      projectId = 0;
    }
    
    // Step 2: Buy IUs as an investor
    console.log(`\n3. Buying IUs as an investor...`);
    
    const iuAmount = 100; // Number of IUs to buy
    const innovationUnitsWithInvestor = innovationUnits.connect(investor);
    const celTokenWithInvestor = celToken.connect(investor);
    
    // Calculate buying cost
    const [basePayment, fee, totalCost] = await innovationUnits.calculateBuyingCost(projectId, iuAmount);
    console.log(`- Base Payment: ${formatAmount(basePayment)} CEL`);
    console.log(`- Fee: ${formatAmount(fee)} CEL`);
    console.log(`- Total Cost: ${formatAmount(totalCost)} CEL`);
    
    // Approve and buy
    await (await celTokenWithInvestor.approve(innovationUnits.address, totalCost)).wait();
    await (await innovationUnitsWithInvestor.buyIUs(projectId, iuAmount)).wait();
    
    const investorIUBalance = await innovationUnits.balanceOf(investor.address, projectId);
    console.log(`Investor now has ${investorIUBalance} IUs`);
    
    // Step 3: Mint IUs to contributors
    console.log(`\n4. Minting IUs to contributors...`);
    
    const contributors = [contributor1.address, contributor2.address];
    const contributorAmounts = [300, 200]; // 300 IUs to contributor1, 200 IUs to contributor2
    
    // Mint to each contributor individually
    await (await innovationUnits.connect(deployer).mintToContributor(projectId, contributor1.address, contributorAmounts[0])).wait();
    await (await innovationUnits.connect(deployer).mintToContributor(projectId, contributor2.address, contributorAmounts[1])).wait();
    
    const contributor1Balance = await innovationUnits.balanceOf(contributor1.address, projectId);
    const contributor2Balance = await innovationUnits.balanceOf(contributor2.address, projectId);
    
    console.log(`Contributor1 now has ${contributor1Balance} IUs`);
    console.log(`Contributor2 now has ${contributor2Balance} IUs`);
    
    // Step 4: Stake CEL tokens on the project
    console.log(`\n5. Staking CEL tokens on the project...`);
    
    const stakeAmount = parseAmount("1000"); // 1000 CEL tokens
    const lockDurationDays = 30; // 30-day lock duration
    
    const projectStakingWithInvestor = projectStaking.connect(investor);
    
    // Approve and stake
    await (await celTokenWithInvestor.approve(projectStaking.address, stakeAmount)).wait();
    await (await projectStakingWithInvestor.stake(projectId, stakeAmount, lockDurationDays)).wait();
    
    const stake = await projectStaking.projectStakes(projectId, investor.address);
    console.log(`Staked ${formatAmount(stake.amount)} CEL for ${stake.lockDuration} days with a score of ${formatAmount(stake.score)}`);
    
    // Step 5: Start a new epoch to enable rewards
    console.log(`\n6. Starting a new epoch to enable rewards...`);
    
    // Check current epoch
    const currentEpochInfo = await emissionController.getCurrentEpochInfo();
    
    // Handle the tuple return from getCurrentEpochInfo
    const [currentEpochNumber, isActive, startTime, endTime] = [
      currentEpochInfo.currentEpochNumber || currentEpochInfo[0],
      currentEpochInfo.isActive || currentEpochInfo[1],
      currentEpochInfo.startTime || currentEpochInfo[2],
      currentEpochInfo.endTime || currentEpochInfo[3]
    ];
    
    console.log(`\nCurrent Epoch Info:`)
    console.log(`- Epoch Number: ${currentEpochNumber}`);
    console.log(`- Is Active: ${isActive}`);
    console.log(`- Start Time: ${startTime > 0 ? new Date(startTime.toNumber() * 1000).toLocaleString() : 'Not started'}`);
    console.log(`- End Time: ${endTime > 0 ? new Date(endTime.toNumber() * 1000).toLocaleString() : 'Not set'}`);
    
    // Check if time advancement is needed
    if (currentEpochNumber.eq ? currentEpochNumber.eq(0) : currentEpochNumber === 0) {
      console.log("Starting first epoch...");
      await (await emissionController.startEpoch()).wait();
    } else {
      console.log("Advancing to next epoch...");
      
      // For demonstration, we'll force a new epoch
      // In production, this would happen automatically based on time
      await network.provider.send("evm_increaseTime", [86400 * 7]); // 7 days
      await network.provider.send("evm_mine");
      
      // Process the current epoch before starting a new one
      if (isActive) {
        console.log("Processing the current epoch...");
        await (await emissionController.processEpoch()).wait();
      }
      
      await (await emissionController.startEpoch()).wait();
    }
    
    const newEpochInfo = await emissionController.getCurrentEpochInfo();
    const [newEpochNumber, newIsActive, newStartTime, newEndTime] = [
      newEpochInfo.currentEpochNumber || newEpochInfo[0],
      newEpochInfo.isActive || newEpochInfo[1],
      newEpochInfo.startTime || newEpochInfo[2],
      newEpochInfo.endTime || newEpochInfo[3]
    ];
    
    console.log(`\nNew Epoch Info:`)
    console.log(`- Epoch Number: ${newEpochNumber}`);
    console.log(`- Is Active: ${newIsActive}`);
    console.log(`- Start Time: ${newStartTime > 0 ? new Date(newStartTime.toNumber() * 1000).toLocaleString() : 'Not started'}`);
    console.log(`- End Time: ${newEndTime > 0 ? new Date(newEndTime.toNumber() * 1000).toLocaleString() : 'Not set'}`);
    
    // Step 6: Claim staker rewards
    console.log(`\n7. Checking and claiming staker rewards...`);
    
    const emissionControllerWithInvestor = emissionController.connect(investor);
    
    // Check unclaimed emissions
    const [hasUnclaimedStaking, unclaimedStakingAmount] = await emissionController.checkUnclaimedStakingEmissions(
      newEpochNumber, 
      projectId, 
      investor.address
    );
    console.log(`Unclaimed Staking Emissions: ${formatAmount(unclaimedStakingAmount)} CEL`);
    
    if (hasUnclaimedStaking && !unclaimedStakingAmount.isZero()) {
      await (await emissionControllerWithInvestor.claimStakingEmissions(
        newEpochNumber, 
        projectId
      )).wait();
      console.log(`Claimed ${formatAmount(unclaimedStakingAmount)} CEL of staking rewards`);
    } else {
      console.log("No staking rewards to claim yet");
    }
    
    // Step 7: Claim IU holder rewards
    console.log(`\n8. Checking and claiming IU holder rewards...`);
    
    // Check unclaimed emissions
    const [hasUnclaimedIU, unclaimedIUAmount] = await emissionController.checkUnclaimedIUHolderEmissions(
      newEpochNumber, 
      projectId, 
      investor.address
    );
    console.log(`Unclaimed IU Holder Emissions: ${formatAmount(unclaimedIUAmount)} CEL`);
    
    if (hasUnclaimedIU && !unclaimedIUAmount.isZero()) {
      await (await emissionControllerWithInvestor.claimIUHolderEmissions(
        newEpochNumber, 
        projectId
      )).wait();
      console.log(`Claimed ${formatAmount(unclaimedIUAmount)} CEL of IU holder rewards`);
    } else {
      console.log("No IU holder rewards to claim yet");
    }
    
    // Step 8: Sell IUs
    console.log(`\n9. Selling some IUs...`);
    
    const sellAmount = 50; // 50 IUs to sell
    
    // Calculate selling return
    const [baseReturn, sellFee, netReturn] = await innovationUnits.calculateSellingReturn(projectId, sellAmount);
    console.log(`- Base Return: ${formatAmount(baseReturn)} CEL`);
    console.log(`- Fee: ${formatAmount(sellFee)} CEL`);
    console.log(`- Net Return: ${formatAmount(netReturn)} CEL`);
    
    const celBalanceBeforeSell = await celToken.balanceOf(investor.address);
    
    // Sell IUs
    await (await innovationUnitsWithInvestor.sellIUs(projectId, sellAmount)).wait();
    
    const celBalanceAfterSell = await celToken.balanceOf(investor.address);
    const celReceived = celBalanceAfterSell.sub(celBalanceBeforeSell);
    
    const investorIUBalanceAfterSell = await innovationUnits.balanceOf(investor.address, projectId);
    
    console.log(`Sold ${sellAmount} IUs and received ${formatAmount(celReceived)} CEL`);
    console.log(`Investor now has ${investorIUBalanceAfterSell} IUs remaining`);
    
    // Step 9: Unstake CEL tokens
    console.log(`\n10. Unstaking CEL tokens...`);
    
    // For demonstration, we'll force time passage to end the lock period
    await network.provider.send("evm_increaseTime", [86400 * lockDurationDays]); // Lock duration days
    await network.provider.send("evm_mine");
    
    const celBalanceBeforeUnstake = await celToken.balanceOf(investor.address);
    
    // Unstake
    await (await projectStakingWithInvestor.unstake(projectId)).wait();
    
    const celBalanceAfterUnstake = await celToken.balanceOf(investor.address);
    const celFromUnstake = celBalanceAfterUnstake.sub(celBalanceBeforeUnstake);
    
    console.log(`Unstaked and received ${formatAmount(celFromUnstake)} CEL`);
    
    // Summary
    console.log(`\n=== Demo Flow Complete ===`);
    console.log(`Project ID: ${projectId}`);
    console.log(`Creator1 (Deployer) Allocation: ${(creatorAllocation * creatorShares[0]) / (creatorShares[0] + creatorShares[1]) / 100}%`);
    console.log(`Creator2 Allocation: ${(creatorAllocation * creatorShares[1]) / (creatorShares[0] + creatorShares[1]) / 100}%`);
    console.log(`Contributor Allocation: ${contributorAllocation / 100}%`);
    console.log(`Investor Allocation: ${investorAllocation / 100}%`);
    
    console.log(`\nCurrent IU Balances:`);
    console.log(`- Investor: ${await innovationUnits.balanceOf(investor.address, projectId)} IUs`);
    console.log(`- Contributor1: ${await innovationUnits.balanceOf(contributor1.address, projectId)} IUs`);
    console.log(`- Contributor2: ${await innovationUnits.balanceOf(contributor2.address, projectId)} IUs`);
    
    console.log(`\nCurrent CEL Balances:`);
    console.log(`- Investor: ${formatAmount(await celToken.balanceOf(investor.address))} CEL`);
    console.log(`- Protocol Treasury: ${formatAmount(await celToken.balanceOf(protocolTreasury.address))} CEL`);
    
  } catch (error) {
    console.error("Error in demo flow:", error);
    if (error.reason) {
      console.error(`Contract reverted with reason: ${error.reason}`);
    }
  }
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  }); 