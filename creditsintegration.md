# Prepaid cross-model AI credits

## Product decision

Replace the proposed yield/Aave flow with stablecoin-funded AI credits. A supported stablecoin payment enters the source-chain treasury; a finalized-payment relay authorizes matching private credit entitlements on Midnight. Users select a configured AI model and spend credits. No APY or investment return is promised. Testnet stablecoins remain valueless, so demo inference costs remain operator-funded.

The previous withdrawable principal-receipt/yield proposal is superseded by this instruction. The user confirmed that unused credits are refundable and spent credits are consumed. The source treasury separates refundable liabilities from earned service revenue.

## Required implementation

- [x] Inspect existing gateway receipts, replay protection, treasury requirements and model adapters.
- [x] Confirm unused-credit refund semantics before writing custody logic.
- [x] Define one supported test asset, exact integer credit conversion, source treasury and destination contract binding.
- [x] Implement finality-checked, replay-safe payment attestation and Midnight credit issuance.
- [x] Support a server-configured model catalog and user model selection.
- [x] Bind paid requests to both model and prompt, preserving same-request retry/caching.
- [x] Display prepaid balance, selected model cost and actual fulfillment state.
- [x] Verify local contracts, interrupted-service recovery, real model routing and the complete local two-chain payment/spend/refund flow.
- [ ] Verify public Sepolia/Preview deployment and physical Brave/passkey flow.

## Trust boundary

The first bridge is an explicitly operator-attested lock/payment-to-credit system. Stablecoins stay in the source EVM treasury. Midnight credits are app-issued entitlements; they are not native USDC and are not produced by an unsupported CCTP route. The treasury must distinguish unused refundable liabilities from earned service revenue if refunds are selected. Model/provider credentials stay server-side. No mainnet deposits or paid provider calls are authorized by this testnet implementation request.

## Latest evidence

`artifacts/prepaid-e2e.json`: five credits purchased, two consumed across actual local models, three refunded; canonical source finality and replay guards checked; remaining balance recovered from the original seed; no remaining source liability after settlement. Recorded model responses include quality errors, so this is transport/accounting evidence, not a correctness claim. `artifacts/prepaid-model-routing.json` records the separate general-text adapter check. The suite has 64 passing tests across 17 files plus 11 EVM tests (including 128 fuzz cases). Public deployment and real extension hardware are not verified.
