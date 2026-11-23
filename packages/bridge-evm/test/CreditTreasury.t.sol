// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {CreditTreasury} from "../src/CreditTreasury.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
interface Vm { function prank(address) external; function expectRevert() external; function expectRevert(bytes4) external; function chainId(uint256) external; }
contract TestStable is ERC20 {
 constructor() ERC20("Test stable", "tUSD") {}
 function decimals() public pure override returns(uint8) { return 6; }
 function mint(address to,uint256 amount) external { _mint(to,amount); }
}
contract TaxedStable is TestStable {
 function _update(address from,address to,uint256 amount) internal override {
  if(from!=address(0)&&to!=address(0)&&amount>1){super._update(from,to,amount-1);super._update(from,address(0),1);}else super._update(from,to,amount);
 }
}
contract CreditTreasuryTest {
 Vm constant vm=Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
 address constant USER=address(0xB0B);address constant RELAY=address(0xA11CE);address constant PAYEE=address(0xCAFE);
 TestStable token; CreditTreasury treasury;
 function setUp() public { token=new TestStable();treasury=new CreditTreasury(token,10000,RELAY,PAYEE);token.mint(USER,1_000_000_000_000);vm.prank(USER);token.approve(address(treasury),type(uint256).max);vm.prank(RELAY);treasury.initializeBridge(bytes32(uint256(123))); }
 function deposit(uint64 units) internal { vm.prank(USER);treasury.deposit(units,bytes32(uint256(456))); }
 function testDuplicatePaymentCommitmentCannotChargeTwice() public {deposit(10);vm.prank(USER);vm.expectRevert(CreditTreasury.Replay.selector);treasury.deposit(10,bytes32(uint256(456)));require(treasury.refundableCredits()==10);}
 function testDepositReservesExactRefundLiability() public {deposit(10);require(treasury.refundableCredits()==10);require(token.balanceOf(address(treasury))==100000);require(treasury.earnedRevenue()==0);}
 function testRefundUnusedAndCollectOnlySpentRevenue() public {deposit(10);vm.prank(RELAY);treasury.settleConsumed(bytes32(uint256(1)));vm.prank(RELAY);treasury.refund(bytes32(uint256(2)),9,USER);treasury.collectRevenue();require(token.balanceOf(PAYEE)==10000);require(token.balanceOf(address(treasury))==0);require(treasury.refundableCredits()==0);}
 function testUnauthorizedMessagesReject() public {deposit(10);vm.expectRevert(CreditTreasury.Unauthorized.selector);treasury.settleConsumed(bytes32(uint256(1)));vm.expectRevert(CreditTreasury.Unauthorized.selector);treasury.refund(bytes32(uint256(2)),1,USER);}
 function testConsumeAndRefundCannotReplay() public {deposit(10);vm.prank(RELAY);treasury.settleConsumed(bytes32(uint256(1)));vm.prank(RELAY);vm.expectRevert(CreditTreasury.Replay.selector);treasury.settleConsumed(bytes32(uint256(1)));vm.prank(RELAY);treasury.refund(bytes32(uint256(2)),2,USER);vm.prank(RELAY);vm.expectRevert(CreditTreasury.Replay.selector);treasury.refund(bytes32(uint256(2)),2,USER);}
 function testCannotRefundSpentUnitsOrWithdrawReserves() public {deposit(1);treasury.collectRevenue();require(token.balanceOf(PAYEE)==0);vm.prank(RELAY);treasury.settleConsumed(bytes32(uint256(1)));vm.prank(RELAY);vm.expectRevert(CreditTreasury.InvalidInput.selector);treasury.refund(bytes32(uint256(2)),1,USER);}
 function testBridgeCannotBeReinitialized() public {vm.prank(RELAY);vm.expectRevert(CreditTreasury.InvalidInput.selector);treasury.initializeBridge(bytes32(uint256(124)));}
 function testZeroAndExcessiveDepositsReject() public {vm.prank(USER);vm.expectRevert(CreditTreasury.InvalidInput.selector);treasury.deposit(0,bytes32(uint256(1)));vm.prank(USER);vm.expectRevert(CreditTreasury.InvalidInput.selector);treasury.deposit(1_000_000_001,bytes32(uint256(1)));}
 function testMainnetDeploymentRejects() public {vm.chainId(1);vm.expectRevert(CreditTreasury.InvalidInput.selector);new CreditTreasury(token,10000,RELAY,PAYEE);}
 function testTaxedAssetRejectsWithoutIssuingCredits() public {TaxedStable taxed=new TaxedStable();CreditTreasury t=new CreditTreasury(taxed,10000,RELAY,PAYEE);vm.prank(RELAY);t.initializeBridge(bytes32(uint256(123)));taxed.mint(USER,100000);vm.prank(USER);taxed.approve(address(t),100000);vm.prank(USER);vm.expectRevert(CreditTreasury.InvalidInput.selector);t.deposit(10,bytes32(uint256(1)));require(t.refundableCredits()==0);require(taxed.balanceOf(USER)==100000);}
 function testFuzzSolventAfterConsumptionAndRefund(uint32 input) public {uint64 units=uint64(input%100000+1);deposit(units);vm.prank(RELAY);treasury.settleConsumed(bytes32(uint256(1)));if(units>1){vm.prank(RELAY);treasury.refund(bytes32(uint256(2)),units-1,USER);}treasury.collectRevenue();require(token.balanceOf(address(treasury))==0);require(treasury.refundableCredits()==0);}
}
