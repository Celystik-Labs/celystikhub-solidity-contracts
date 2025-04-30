// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./interfaces/IProjectFactory.sol";
import "./interfaces/IProjectIUToken.sol";
import "./interfaces/ICELToken.sol";
import "./interfaces/IStaking.sol";
import "./interfaces/ITreasury.sol";
import "./ProjectIUToken.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

/**
 * @title ProjectFactory
 * @dev Factory contract for creating and managing CelystikHub projects
 */
contract ProjectFactory is IProjectFactory, Ownable, ReentrancyGuard {
    using SafeMath for uint256;

    // Constants
    uint256 private constant PRECISION = 1e18;
    uint256 private constant HUNDRED_PERCENT = 100 * PRECISION;

    // Participant roles
    uint8 private constant ROLE_CREATOR = 1;
    uint8 private constant ROLE_CONTRIBUTOR = 2;
    uint8 private constant ROLE_INVESTOR = 3;

    // Core contracts
    ICELToken public celToken;
    IStaking public staking;
    ITreasury public treasury;

    // Project tracking
    uint256 public nextProjectId = 1;
    mapping(uint256 => address) public projectTokens; // projectId => IU token contract
    mapping(uint256 => Project) public projects; // projectId => Project
    mapping(address => bool) public isProjectToken; // IU token => exists

    // Project creator tracking
    mapping(uint256 => address[]) public projectCreators; // projectId => creator addresses
    mapping(uint256 => mapping(address => bool)) public isCreator; // projectId => creator => is creator

    // Project participant tracking
    mapping(uint256 => mapping(address => Participant))
        public projectParticipants; // projectId => participant address => participant data
    mapping(uint256 => address[]) public projectContributors; // projectId => contributor addresses
    mapping(uint256 => address[]) public projectInvestors; // projectId => investor addresses
    mapping(uint256 => mapping(address => bool)) public isContributor; // projectId => address => is contributor
    mapping(uint256 => mapping(address => bool)) public isInvestor; // projectId => address => is investor

    // Project liquidity tracking
    mapping(uint256 => uint256) public projectLiquidity; // projectId => liquidity amount in CEL tokens

    // Project reserve tracking
    mapping(uint256 => uint256) public allocatedContributorReserve; // projectId => total IUs allocated to contributors
    mapping(uint256 => uint256) public allocatedInvestorReserve; // projectId => total IUs allocated to investors

    /**
     * @dev Constructor to initialize the ProjectFactory contract
     * @param _celToken Address of the CEL token
     * @param _staking Address of the Staking contract
     * @param _treasury Address of the Treasury contract
     */
    constructor(address _celToken, address _staking, address _treasury) {
        require(
            _celToken != address(0),
            "ProjectFactory: zero CEL token address"
        );
        require(_staking != address(0), "ProjectFactory: zero staking address");
        require(
            _treasury != address(0),
            "ProjectFactory: zero treasury address"
        );

        celToken = ICELToken(_celToken);
        staking = IStaking(_staking);
        treasury = ITreasury(_treasury);
    }

    /**
     * @dev Creates a new project
     * @param name Name of the project
     * @param description Description of the project
     * @param totalSupply Total supply of IUs
     * @param pricePerUnit Price per IU in CEL tokens
     * @param creatorShare Percentage allocated to creators
     * @param contributorReserve Percentage reserved for contributors
     * @param investorReserve Percentage reserved for investors
     * @param creators Array of creator addresses
     * @param creatorShares Array of creator shares
     * @param stakeLimit Maximum stake limit (0 = no limit)
     * @return uint256 The ID of the created project
     */
    function createProject(
        string memory name,
        string memory description,
        uint256 totalSupply,
        uint256 pricePerUnit,
        uint256 creatorShare,
        uint256 contributorReserve,
        uint256 investorReserve,
        address[] memory creators,
        uint256[] memory creatorShares,
        uint256 stakeLimit
    ) external override returns (uint256) {
        // Validate inputs
        require(bytes(name).length > 0, "ProjectFactory: empty name");
        require(totalSupply > 0, "ProjectFactory: zero supply");
        require(pricePerUnit > 0, "ProjectFactory: zero price");
        require(
            creatorShare.add(contributorReserve).add(investorReserve) ==
                HUNDRED_PERCENT,
            "ProjectFactory: shares must add up to 100%"
        );
        require(creators.length > 0, "ProjectFactory: no creators");
        require(
            creators.length == creatorShares.length,
            "ProjectFactory: arrays length mismatch"
        );

        // Validate creator shares add up to 100%
        uint256 totalCreatorShares = 0;
        for (uint256 i = 0; i < creatorShares.length; i++) {
            totalCreatorShares = totalCreatorShares.add(creatorShares[i]);
        }
        require(
            totalCreatorShares == HUNDRED_PERCENT,
            "ProjectFactory: creator shares must add up to 100%"
        );

        // Assign project ID
        uint256 projectId = nextProjectId;
        nextProjectId++;

        // Deploy new IU token contract
        address tokenAddress = deployProjectToken(
            projectId,
            name,
            description,
            totalSupply,
            pricePerUnit,
            creatorShare,
            contributorReserve,
            investorReserve
        );

        // Store project data
        projects[projectId] = Project({
            id: projectId,
            name: name,
            description: description,
            tokenAddress: tokenAddress,
            totalSupply: totalSupply,
            pricePerUnit: pricePerUnit,
            creatorShare: creatorShare,
            contributorReserve: contributorReserve,
            investorReserve: investorReserve,
            createdAt: block.timestamp,
            active: true
        });

        // Initialize project liquidity and reserves
        projectLiquidity[projectId] = 0;
        allocatedContributorReserve[projectId] = 0;
        allocatedInvestorReserve[projectId] = 0;

        // Get token contract
        IProjectIUToken token = IProjectIUToken(tokenAddress);

        // Register project creators and mint IUs
        for (uint256 i = 0; i < creators.length; i++) {
            address creator = creators[i];
            require(
                creator != address(0),
                "ProjectFactory: zero creator address"
            );

            projectCreators[projectId].push(creator);
            isCreator[projectId][creator] = true;

            // Calculate creator's IU allocation
            uint256 creatorAllocation = totalSupply
                .mul(creatorShare)
                .div(HUNDRED_PERCENT)
                .mul(creatorShares[i])
                .div(HUNDRED_PERCENT);

            // Initialize creator in participant tracking
            Participant storage participant = projectParticipants[projectId][
                creator
            ];
            participant.role = ROLE_CREATOR;
            participant.iuBalance = creatorAllocation;
            participant.exists = true;
        }

        // Create staking pool
        staking.createStakingPool(projectId, stakeLimit, 1 days); // Min staking period = 1 day

        // Mint IUs to creators
        token.mintToCreators(creators, creatorShares);

        emit ProjectCreated(
            projectId,
            name,
            tokenAddress,
            totalSupply,
            creators,
            creatorShares
        );

        return projectId;
    }

    /**
     * @dev Deploys a new IU token contract for a project
     * @param projectId ID of the project
     * @param name Name of the project
     * @param description Description of the project
     * @param totalSupply Total supply of IUs
     * @param pricePerUnit Price per IU in CEL tokens
     * @param creatorShare Percentage allocated to creators
     * @param contributorReserve Percentage reserved for contributors
     * @param investorReserve Percentage reserved for investors
     * @return address The address of the deployed token contract
     */
    function deployProjectToken(
        uint256 projectId,
        string memory name,
        string memory description,
        uint256 totalSupply,
        uint256 pricePerUnit,
        uint256 creatorShare,
        uint256 contributorReserve,
        uint256 investorReserve
    ) internal returns (address) {
        // Deploy new token contract
        address treasuryAddress = address(treasury);

        bytes memory bytecode = type(ProjectIUToken).creationCode;
        bytes memory constructorArgs = abi.encode(
            projectId,
            name,
            description,
            totalSupply,
            pricePerUnit,
            creatorShare,
            contributorReserve,
            investorReserve,
            treasuryAddress
        );

        bytes32 salt = keccak256(abi.encodePacked(projectId, block.timestamp));
        address tokenAddress;

        assembly {
            tokenAddress := create2(
                0,
                add(bytecode, 0x20),
                mload(bytecode),
                salt
            )
            if iszero(extcodesize(tokenAddress)) {
                revert(0, 0)
            }
        }

        // Register token contract
        projectTokens[projectId] = tokenAddress;
        isProjectToken[tokenAddress] = true;

        return tokenAddress;
    }

    /**
     * @dev Purchases IUs for a project
     * @param projectId ID of the project
     * @param amount Amount of CEL tokens to invest
     * @return bool indicating if the purchase was successful
     */
    function purchaseIUs(
        uint256 projectId,
        uint256 amount
    ) external override nonReentrant returns (bool) {
        require(amount > 0, "ProjectFactory: zero amount");
        require(
            projectTokens[projectId] != address(0),
            "ProjectFactory: project not found"
        );
        require(
            projects[projectId].active,
            "ProjectFactory: project not active"
        );

        // Get token contract and project details
        IProjectIUToken token = IProjectIUToken(projectTokens[projectId]);
        Project storage project = projects[projectId];

        // Calculate fee
        uint256 fee = token.calculateFee(amount);
        uint256 investment = amount.sub(fee);

        // Calculate IUs to mint based on price
        uint256 iuAmount = investment.div(project.pricePerUnit);

        // Check if purchase exceeds the investor reserve
        uint256 totalInvestorAllocation = project
            .totalSupply
            .mul(project.investorReserve)
            .div(HUNDRED_PERCENT);
        require(
            allocatedInvestorReserve[projectId].add(iuAmount) <=
                totalInvestorAllocation,
            "ProjectFactory: exceeds investor reserve"
        );

        // Transfer CEL tokens
        require(
            celToken.transferFrom(msg.sender, address(this), amount),
            "ProjectFactory: transfer failed"
        );

        // Send fee to treasury
        require(
            celToken.transfer(address(treasury), fee),
            "ProjectFactory: fee transfer failed"
        );

        // Update project liquidity
        uint256 previousLiquidity = projectLiquidity[projectId];
        projectLiquidity[projectId] = previousLiquidity.add(investment);

        // Update investor reserve allocation
        allocatedInvestorReserve[projectId] = allocatedInvestorReserve[
            projectId
        ].add(iuAmount);

        // Emit liquidity change event
        emit ProjectLiquidityChanged(
            projectId,
            previousLiquidity,
            projectLiquidity[projectId]
        );

        // Update investor tracking
        Participant storage participant = projectParticipants[projectId][
            msg.sender
        ];

        // Add as investor if first time
        if (!isInvestor[projectId][msg.sender]) {
            projectInvestors[projectId].push(msg.sender);
            isInvestor[projectId][msg.sender] = true;

            if (!participant.exists) {
                participant.exists = true;
                participant.role = ROLE_INVESTOR;
            } else {
                participant.role = participant.role | ROLE_INVESTOR;
            }
        }

        // Update investor stats
        participant.iuBalance = participant.iuBalance.add(iuAmount);
        participant.totalInvested = participant.totalInvested.add(iuAmount);

        // Mint IUs to investor
        token.mintToInvestor(msg.sender, investment);

        emit IUsPurchased(projectId, msg.sender, amount, fee);

        return true;
    }

    /**
     * @dev Allocates IUs to a contributor
     * @param projectId ID of the project
     * @param contributor Address of the contributor
     * @param amount Amount of IUs to allocate
     * @return bool indicating if the allocation was successful
     */
    function allocateToContributor(
        uint256 projectId,
        address contributor,
        uint256 amount
    ) external override returns (bool) {
        require(
            isCreator[projectId][msg.sender],
            "ProjectFactory: not creator"
        );
        require(
            contributor != address(0),
            "ProjectFactory: zero contributor address"
        );
        require(amount > 0, "ProjectFactory: zero amount");
        require(
            projectTokens[projectId] != address(0),
            "ProjectFactory: project not found"
        );
        require(
            projects[projectId].active,
            "ProjectFactory: project not active"
        );

        // Get project details
        Project storage project = projects[projectId];

        // Check if allocation exceeds the contributor reserve
        uint256 totalContributorAllocation = project
            .totalSupply
            .mul(project.contributorReserve)
            .div(HUNDRED_PERCENT);
        require(
            allocatedContributorReserve[projectId].add(amount) <=
                totalContributorAllocation,
            "ProjectFactory: exceeds contributor reserve"
        );

        // Update contributor reserve allocation
        allocatedContributorReserve[projectId] = allocatedContributorReserve[
            projectId
        ].add(amount);

        // Update contributor tracking
        Participant storage participant = projectParticipants[projectId][
            contributor
        ];

        // Add as contributor if first time
        if (!isContributor[projectId][contributor]) {
            projectContributors[projectId].push(contributor);
            isContributor[projectId][contributor] = true;

            if (!participant.exists) {
                participant.exists = true;
                participant.role = ROLE_CONTRIBUTOR;
            } else {
                participant.role = participant.role | ROLE_CONTRIBUTOR;
            }
        }

        // Update contributor stats
        participant.iuBalance = participant.iuBalance.add(amount);
        participant.totalContributed = participant.totalContributed.add(amount);

        // Get token contract and mint to contributor
        IProjectIUToken token = IProjectIUToken(projectTokens[projectId]);
        token.mintToContributor(contributor, amount);

        emit ContributorAllocated(projectId, contributor, amount);

        return true;
    }

    /**
     * @dev Updates a project's price per IU
     * @param projectId ID of the project
     * @param newPrice New price per IU
     * @return bool indicating if the update was successful
     */
    function updateProjectPrice(
        uint256 projectId,
        uint256 newPrice
    ) external override returns (bool) {
        require(
            isCreator[projectId][msg.sender],
            "ProjectFactory: not creator"
        );
        require(newPrice > 0, "ProjectFactory: zero price");
        require(
            projectTokens[projectId] != address(0),
            "ProjectFactory: project not found"
        );

        // Get token contract and update price
        IProjectIUToken token = IProjectIUToken(projectTokens[projectId]);
        token.updatePrice(newPrice);

        // Update project record
        projects[projectId].pricePerUnit = newPrice;

        emit ProjectPriceUpdated(projectId, newPrice);

        return true;
    }

    /**
     * @dev Sets a project's active state
     * @param projectId ID of the project
     * @param active New active state
     * @return bool indicating if the update was successful
     */
    function setProjectActive(
        uint256 projectId,
        bool active
    ) external override returns (bool) {
        require(
            isCreator[projectId][msg.sender] || msg.sender == owner(),
            "ProjectFactory: not authorized"
        );
        require(
            projectTokens[projectId] != address(0),
            "ProjectFactory: project not found"
        );

        // Get token contract and update active state
        IProjectIUToken token = IProjectIUToken(projectTokens[projectId]);
        token.setActive(active);

        // Update project record
        projects[projectId].active = active;

        emit ProjectActiveStatusChanged(projectId, active);

        return true;
    }

    /**
     * @dev Returns a project's data
     * @param projectId ID of the project
     * @return Project The project data
     */
    function getProject(
        uint256 projectId
    ) external view override returns (Project memory) {
        return projects[projectId];
    }

    /**
     * @dev Returns a project's creators
     * @param projectId ID of the project
     * @return address[] Array of creator addresses
     */
    function getProjectCreators(
        uint256 projectId
    ) external view override returns (address[] memory) {
        return projectCreators[projectId];
    }

    /**
     * @dev Returns a project's contributors
     * @param projectId ID of the project
     * @return address[] Array of contributor addresses
     */
    function getProjectContributors(
        uint256 projectId
    ) external view override returns (address[] memory) {
        return projectContributors[projectId];
    }

    /**
     * @dev Returns a project's investors
     * @param projectId ID of the project
     * @return address[] Array of investor addresses
     */
    function getProjectInvestors(
        uint256 projectId
    ) external view override returns (address[] memory) {
        return projectInvestors[projectId];
    }

    /**
     * @dev Checks if an address is a creator for a project
     * @param projectId ID of the project
     * @param creator Address to check
     * @return bool True if the address is a creator
     */
    function isProjectCreator(
        uint256 projectId,
        address creator
    ) external view override returns (bool) {
        return isCreator[projectId][creator];
    }

    /**
     * @dev Checks if an address is a contributor for a project
     * @param projectId ID of the project
     * @param contributor Address to check
     * @return bool True if the address is a contributor
     */
    function isProjectContributor(
        uint256 projectId,
        address contributor
    ) external view override returns (bool) {
        return isContributor[projectId][contributor];
    }

    /**
     * @dev Checks if an address is an investor for a project
     * @param projectId ID of the project
     * @param investor Address to check
     * @return bool True if the address is an investor
     */
    function isProjectInvestor(
        uint256 projectId,
        address investor
    ) external view override returns (bool) {
        return isInvestor[projectId][investor];
    }

    /**
     * @dev Returns a participant's data for a project
     * @param projectId ID of the project
     * @param participant Address of the participant
     * @return Participant The participant's data
     */
    function getProjectParticipant(
        uint256 projectId,
        address participant
    ) external view override returns (Participant memory) {
        return projectParticipants[projectId][participant];
    }

    /**
     * @dev Returns a project's liquidity
     * @param projectId ID of the project
     * @return uint256 The project's liquidity in CEL tokens
     */
    function getProjectLiquidity(
        uint256 projectId
    ) external view override returns (uint256) {
        return projectLiquidity[projectId];
    }

    /**
     * @dev Returns allocated and available contributor reserve for a project
     * @param projectId ID of the project
     * @return allocated The IUs allocated to contributors so far
     * @return total The total IUs reserved for contributors
     * @return available The IUs still available for contributors
     */
    function getContributorReserveInfo(
        uint256 projectId
    )
        external
        view
        override
        returns (uint256 allocated, uint256 total, uint256 available)
    {
        Project storage project = projects[projectId];
        allocated = allocatedContributorReserve[projectId];
        total = project.totalSupply.mul(project.contributorReserve).div(
            HUNDRED_PERCENT
        );
        available = total > allocated ? total.sub(allocated) : 0;
        return (allocated, total, available);
    }

    /**
     * @dev Returns allocated and available investor reserve for a project
     * @param projectId ID of the project
     * @return allocated The IUs allocated to investors so far
     * @return total The total IUs reserved for investors
     * @return available The IUs still available for investors
     */
    function getInvestorReserveInfo(
        uint256 projectId
    )
        external
        view
        override
        returns (uint256 allocated, uint256 total, uint256 available)
    {
        Project storage project = projects[projectId];
        allocated = allocatedInvestorReserve[projectId];
        total = project.totalSupply.mul(project.investorReserve).div(
            HUNDRED_PERCENT
        );
        available = total > allocated ? total.sub(allocated) : 0;
        return (allocated, total, available);
    }

    /**
     * @dev Sells IUs for a project
     * @param projectId ID of the project
     * @param amount Amount of IUs to sell
     * @return bool indicating if the sale was successful
     */
    function sellIUs(
        uint256 projectId,
        uint256 amount
    ) external override nonReentrant returns (bool) {
        require(amount > 0, "ProjectFactory: zero amount");
        require(
            projectTokens[projectId] != address(0),
            "ProjectFactory: project not found"
        );
        require(
            projects[projectId].active,
            "ProjectFactory: project not active"
        );

        // Get token contract and project details
        IProjectIUToken token = IProjectIUToken(projectTokens[projectId]);
        Project storage project = projects[projectId];

        // Calculate CEL tokens to return based on the project's price
        uint256 celAmount = amount.mul(project.pricePerUnit);

        // Calculate selling fee (20%)
        uint256 sellingFee = celAmount.mul(20).div(100);
        uint256 returnAmount = celAmount.sub(sellingFee);

        // Check if project has enough liquidity
        require(
            projectLiquidity[projectId] >= returnAmount,
            "ProjectFactory: insufficient project liquidity"
        );

        // Update project liquidity
        uint256 previousLiquidity = projectLiquidity[projectId];
        projectLiquidity[projectId] = previousLiquidity.sub(returnAmount);

        // Emit liquidity change event
        emit ProjectLiquidityChanged(
            projectId,
            previousLiquidity,
            projectLiquidity[projectId]
        );

        // Update participant IU balance
        Participant storage participant = projectParticipants[projectId][
            msg.sender
        ];
        require(
            participant.exists && participant.iuBalance >= amount,
            "ProjectFactory: insufficient IU balance"
        );
        participant.iuBalance = participant.iuBalance.sub(amount);

        // Update reserve allocation based on participant role
        if ((participant.role & ROLE_INVESTOR) != 0) {
            // Reduce from investor reserve if selling investor IUs
            uint256 investorAmount = amount > participant.totalInvested
                ? participant.totalInvested
                : amount;

            if (investorAmount > 0) {
                allocatedInvestorReserve[projectId] = allocatedInvestorReserve[
                    projectId
                ].sub(
                        investorAmount > allocatedInvestorReserve[projectId]
                            ? allocatedInvestorReserve[projectId]
                            : investorAmount
                    );
                participant.totalInvested = participant.totalInvested.sub(
                    investorAmount
                );
            }
        }

        if ((participant.role & ROLE_CONTRIBUTOR) != 0) {
            // Reduce from contributor reserve if selling contributor IUs
            uint256 contributorAmount = amount > participant.totalContributed
                ? participant.totalContributed
                : amount;

            if (contributorAmount > 0) {
                allocatedContributorReserve[
                    projectId
                ] = allocatedContributorReserve[projectId].sub(
                    contributorAmount > allocatedContributorReserve[projectId]
                        ? allocatedContributorReserve[projectId]
                        : contributorAmount
                );
                participant.totalContributed = participant.totalContributed.sub(
                    contributorAmount
                );
            }
        }

        // Burn the IUs from the seller
        require(
            token.burn(msg.sender, amount),
            "ProjectFactory: burning IUs failed"
        );

        // Transfer selling fee to treasury
        require(
            celToken.transfer(address(treasury), sellingFee),
            "ProjectFactory: fee transfer failed"
        );

        // Transfer CEL tokens to seller
        require(
            celToken.transfer(msg.sender, returnAmount),
            "ProjectFactory: transfer failed"
        );

        emit IUsSold(projectId, msg.sender, amount, celAmount, sellingFee);

        return true;
    }
}
