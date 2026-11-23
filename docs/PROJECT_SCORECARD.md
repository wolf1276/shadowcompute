# ShadowCompute: project-wide completion standards

These six criteria apply to the contracts, backend, UI, infrastructure, demo and business story. This is an evidence checklist, not a claimed judging score.

## Current product

The current product is prepaid, refundable AI access: pay the supported test asset into a source treasury → receive private Midnight credit entitlements → choose a configured model → spend through proof-backed authorization → refund unused credits. Spent credits become service revenue. The source treasury is EVM; private credit authorization is a genuine Compact application on Midnight. The relay is trusted, not a trustless bridge.

The earlier simulated-yield vault remains available for existing notes and recorded demonstrations. It is not the current product promise. No APY, native USDC-on-Midnight, Aave integration or sustainable investment return is claimed. See ../creditsintegration.md and ../README.md for the implementation and operating procedure.

## All six criteria

| Area | Implemented evidence | Remaining acceptance gate |
|---|---|---|
| Engineering & Implementation | Source treasury, real Compact credit contract, private ownership/membership proofs, replay-safe payment attestation, consumption/refund settlement, configured model routing | Complete public Sepolia → Midnight Preview deployment and installed-wallet walkthrough; production authority/key policy |
| Quality Assurance & Reliability | 66 offline tests; 11 treasury tests including 128 fuzz cases; recorded real local two-chain purchase/spend/refund; durable replay and pending-operation journals | Rehearse browser interruption/recovery with physical wallets; independent security review and load testing |
| Product & Vision | One prepaid balance, selectable models, refundable unused credits; legacy yield separated | Validate that funding-position privacy and cross-model access solve a real buyer problem |
| User Experience & Design | Purchase/spend/refund controls, encrypted notes, recovery, wallet approvals, model selection and actual operation stages | Physical extension/passkey, keyboard/mobile and new-user acceptance; record where onboarding fails |
| Communication | Architecture/privacy/threat/runbook documentation and transaction evidence with explicit trust boundaries | Rehearsed current-product demo; every claim must map to evidence, with local/public and mock/real clearly distinguished |
| Business Development & Viability | Refundable liability separated from earned revenue; operator-funded test inference and configured pricing | Measure cost per completed request, retries, proving/relay and support; interview buyers; demonstrate positive margin without reserve leakage |

## Evidence and limits

- `artifacts/prepaid-e2e.json`: actual local Anvil + Midnight node/proof-server flow, five purchased credits, two consumed across local models, three refunded, zero remaining source refund liability. Recorded responses contain quality errors: this proves transport/accounting, not answer correctness.
- `artifacts/prepaid-model-routing.json`: separate configured model-routing evidence.
- `artifacts/browser-vault-local.json`: legacy vault proof integration, not evidence of public prepaid deployment.
- Existing Preview vault/token deployments do not establish that the new prepaid bridge is deployed publicly.
- The gateway/model sees request content. The trusted local prover sees note openings. Public funding/refund amounts, timing and a small anonymity set permit correlation. Passkeys protect local unlock, not transaction signing.

## Demo acceptance

1. State the current prepaid product and the trusted-relay/privacy limits.
2. Connect the supported wallets, unlock notes and save an encrypted recovery backup.
3. Purchase with the supported test asset; show actual source finality and Midnight issuance.
4. Select a configured model and execute a real request. Retry the same model/prompt/receipt without a second charge.
5. Refund the unused balance; show confirmed burn, source transfer and remaining treasury liabilities.
6. Rehearse decline, reload, unknown submission and recovery without replacing pending transactions or losing notes.

Keep recorded local evidence as a clearly labeled backup. Never substitute it for live public acceptance or fabricate transactions/model responses.

## Business validation

Initial hypotheses are privacy-conscious AI users and sponsored developer programs. Compare against ordinary prepaid aggregators and anonymous prepaid compute: determine whether Midnight privacy justifies the added wallet and relay complexity. Interview users about privacy, model choice, capital lockup, refund expectations and willingness to pay; do not claim traction without results.

Measure revenue only after consumption, while preserving the full unused-credit refund reserve. Measure inference, repair/retry, hardware/energy, proof, settlement and support costs separately. Free model access and valueless test tokens do not establish commercial viability. Define a bounded failure/reconciliation policy before commercial use.

## Priority and release boundary

Finish public testnet and physical-wallet acceptance, then recovery/accessibility rehearsals and a concise recorded demo. Measure costs and validate buyers before adding lending or other integrations. Production requires independent security review, protected attestation/admin keys, monitoring and durable state/recovery procedures. No mainnet or real funds are included in this MVP acceptance.

## Completion pass, 2026-11-24

Public deployment tooling and isolated Preview state are implemented; submission is pending at the user's request. See PUBLIC_PREPAID_DEPLOYMENT.md. The resumed local replay/recovery check passed without resetting chains; inference used existing cached receipts, recorded separately in artifacts/prepaid-resume.json. Six fresh direct-model calls and gross GPU samples are recorded in artifacts/inference-cost-benchmark.json, with explicit partial-cost/quality limits in BUSINESS_VALIDATION.md. Physical wallet/passkey and real customer acceptance remain external gates; no interviews or business success were invented.
