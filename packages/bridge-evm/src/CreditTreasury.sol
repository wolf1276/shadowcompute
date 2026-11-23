// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Testnet-only, operator-attested stablecoin-to-Midnight-credit treasury.
/// @dev The immutable relay is trusted to attest Midnight consumption and refunds correctly.
contract CreditTreasury is ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable asset;
    address public immutable relay;
    address public immutable revenueRecipient;
    uint64 public immutable creditPrice;
    bytes32 public midnightBridge;
    uint256 public refundableCredits;
    uint256 public earnedRevenue;
    uint256 public depositNonce;
    mapping(bytes32 => bool) public consumedMessages;
    mapping(bytes32 => bool) public usedCommitments;
    event CreditDeposit(bytes32 indexed depositId, address indexed payer, bytes32 indexed ownerCommitment, uint64 credits, uint256 amount, bytes32 midnightBridge);
    event CreditsConsumed(bytes32 indexed receiptId, uint64 credits);
    event CreditsRefunded(bytes32 indexed refundId, address indexed recipient, uint64 credits, uint256 amount);
    event RevenueCollected(uint256 amount);
    error InvalidInput();
    error Unauthorized();
    error Replay();
    constructor(IERC20 token, uint64 price, address attester, address payee) {
        if (block.chainid != 31337 && block.chainid != 11155111) revert InvalidInput();
        if (address(token).code.length == 0 || price == 0 || attester == address(0) || payee == address(0)) revert InvalidInput();
        asset = token; creditPrice = price; relay = attester; revenueRecipient = payee;
    }
    modifier onlyRelay() { if (msg.sender != relay) revert Unauthorized(); _; }
    function initializeBridge(bytes32 instance) external onlyRelay {
        if (midnightBridge != bytes32(0) || instance == bytes32(0)) revert InvalidInput();
        midnightBridge = instance;
    }
    function deposit(uint64 credits, bytes32 ownerCommitment) external nonReentrant returns (bytes32 id) {
        if (midnightBridge == bytes32(0) || credits == 0 || credits > 1_000_000_000 || ownerCommitment == bytes32(0)) revert InvalidInput();
        if (usedCommitments[ownerCommitment]) revert Replay();
        usedCommitments[ownerCommitment] = true;
        uint256 amount = uint256(credits) * creditPrice;
        uint256 beforeBalance = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), amount);
        // Reject taxed/rebasing transfer behavior rather than issuing underfunded credits.
        if (asset.balanceOf(address(this)) - beforeBalance != amount) revert InvalidInput();
        id = keccak256(abi.encode(block.chainid, address(this), midnightBridge, ++depositNonce));
        refundableCredits += credits;
        emit CreditDeposit(id, msg.sender, ownerCommitment, credits, amount, midnightBridge);
    }
    function settleConsumed(bytes32 receiptId) external onlyRelay nonReentrant {
        if (receiptId == bytes32(0)) revert InvalidInput();
        _consume(keccak256(abi.encode("SPEND", midnightBridge, receiptId)));
        if (refundableCredits == 0) revert InvalidInput();
        refundableCredits -= 1;
        earnedRevenue += creditPrice;
        emit CreditsConsumed(receiptId, 1);
    }
    function refund(bytes32 refundId, uint64 credits, address recipient) external onlyRelay nonReentrant {
        if (refundId == bytes32(0) || credits == 0 || recipient == address(0) || credits > refundableCredits) revert InvalidInput();
        _consume(keccak256(abi.encode("REFUND", midnightBridge, refundId)));
        refundableCredits -= credits;
        uint256 amount = uint256(credits) * creditPrice;
        asset.safeTransfer(recipient, amount);
        emit CreditsRefunded(refundId, recipient, credits, amount);
    }
    function collectRevenue() external nonReentrant {
        uint256 amount = earnedRevenue;
        earnedRevenue = 0;
        asset.safeTransfer(revenueRecipient, amount);
        emit RevenueCollected(amount);
    }
    function _consume(bytes32 id) private {
        if (midnightBridge == bytes32(0) || id == bytes32(0)) revert InvalidInput();
        if (consumedMessages[id]) revert Replay();
        consumedMessages[id] = true;
    }
}
