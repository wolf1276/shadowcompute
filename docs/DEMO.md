# ShadowCompute prepaid demo and acceptance

## Two-minute explanation

Pay the supported test asset once, receive private Midnight credits, choose a configured AI model and refund unused credits. The source EVM treasury separates refundable liabilities from earned service revenue. Compact circuits authorize private ownership and one-time spending; the gateway validates finalized receipts. The bridge operator remains trusted.

Payments/refunds and amounts are public. Timing permits correlation. The trusted local prover sees note openings, and the gateway/model sees prompts. Test tokens do not pay real-world inference bills. No yield or investment return is promised.

## Rehearse

Use README.md to start the existing local services and open http://localhost:8792. Preserve the deployment, note backups, replay database and pending journals. Do not reset either chain to hide a failed attempt. Public deployment is separately prepared in PUBLIC_PREPAID_DEPLOYMENT.md and submission is pending by request.

1. Connect source EVM and Midnight wallets. Unlock encrypted notes and save a recovery backup.
2. Buy five credits with the supported test token. Show the source transaction and actual finality before issuance on Midnight.
3. Spend one credit on a configured general-text model; display its response without implying correctness.
4. Repeat the identical model/prompt/receipt. Show cached completion without another spend. A different model/prompt must reject reuse.
5. Select another model and spend a second credit. For compiler mode use the exact demo task from `demos/compact-prompt.txt`; compiler acceptance is separate from a code audit.
6. Recover the remaining three credits from the original payment seed in an empty recovery profile.
7. Refund those unused credits. Show Midnight burn, finalized source refund and treasury liability/revenue separation.
8. State the privacy/trusted-relay/model-quality limits and business assumptions explicitly.

## Failure acceptance

- Declined wallet approval must not produce a submitted-success state.
- Reload during an operation must retain its encrypted journal and original transaction. Reconcile before replacement.
- Retry inference using the same receipt/model/prompt; uncertain provider outcomes need reconciliation.
- Restore the original seed or encrypted backup in an empty profile. Never overwrite newer populated notes with an old backup.
- Second-tab writes, wrong scope/password and unsupported/cancelled passkey ceremonies must fail without losing the password recovery route.
- Public-test faucets are user-managed. The local Anvil faucet must remain disabled on Sepolia.

## Evidence

`artifacts/prepaid-e2e.json` preserves the original actual local two-chain proof/model run. `artifacts/prepaid-resume.json` records the later completed-deployment replay/recovery check; its inference came from the existing cache and is not a new model/proof run. `artifacts/inference-cost-benchmark.json` records six fresh direct local-model calls, separate from paid authorization.

The browser checks cover the locked credits view, missing-wallet guidance, keyboard focus and mobile overflow. They do not establish physical extension/passkey acceptance. The connected browser has no wallet extension. Business validation requires actual interviews; the worksheet and cost boundary are in BUSINESS_VALIDATION.md. Recorded local evidence is a labeled fallback, never a substitute for a claimed public deployment.
