# Sepolia → Midnight Preview deployment

Submission is intentionally pending at the user's request. No new public prepaid address or deployment success is claimed. The old Preview vault/token is a separate product instance.

## Prerequisites and read-only check

Use Node 24, the pinned dependencies and existing proving keys. The official Midnight Ledger 9 compatibility reference is https://docs.midnight.network/relnotes/ledger-9 and network endpoints are https://docs.midnight.network/relnotes/network . They were rechecked on 2026-11-24; no dependency upgrade is needed for this deployment preparation.

1. Preserve the existing `.env.preview` and its funded Midnight sponsor seed/password.
2. Copy `config/prepaid.preview.env.example` to `.env.prepaid.preview`, set mode 600 and configure a dedicated Sepolia test-only relay key and HTTPS RPC. Never paste secrets into chat or commit these files.
3. Run `npm run test:treasury`, `npm run typecheck` and `npm test`.
4. Run `npm run preflight:prepaid:preview`. It sends no transactions. Its report in `artifacts/prepaid-preview-preflight.json` lists missing configuration or the public deployer/test-gas balance and existing recovery state. It does not establish sufficient gas or a completed Midnight wallet sync.

Current read-only preflight found no Sepolia RPC/key. No faucet was requested. Physical browser wallets and passkey hardware are not available through the connected browser.

## Submission when configured

`ALLOW_PUBLIC_TEST_DEPLOY=yes npm run deploy:prepaid:preview`

The command hard-checks Sepolia chain ID 11155111 and Preview, synchronizes the existing Midnight wallet, then deploys an explicitly valueless, unrestricted-mint six-decimal demo token, the source treasury and the Compact credit contract, and links the treasury to that exact Midnight instance. It does not deploy USDC. Existing manifests, issuer secrets, runtime configuration or recovery journals prevent a new deployment.

Signed source transaction bytes are persisted before broadcast; the signed Midnight transaction is retained before submission. The workflow does not automatically restart partial deployments. Preserve `.private-states/prepaid-preview-deploy.pending` and reconcile the last hash/bytes if interrupted. Only a proven absence of the original transaction justifies a carefully reviewed recovery; do not delete the guard and redeploy.

A public manifest excludes the private RPC URL. The working manifest is `.private-states/deployment.prepaid.preview.json`; issuer state, relay journals and gateway database are separated from local instances. The runtime configuration contains public service settings but remains gitignored.

## Start and accept

After a confirmed deployment:

```sh
npm run gateway:prepaid:preview
npm run terminal:prepaid:preview
```

Open http://localhost:8794 in a browser with both supported wallet connectors. The public-demo token can be minted through its explicit test-token `mint(address,uint256)` function; the local Anvil faucet is disabled on Sepolia. Fund only test gas through the user's chosen mechanism. Sepolia finality can take minutes; inclusion is not sufficient.

Record source purchase/hash/finality, Midnight issuance/credit spend, actual selected-model inference, identical-request cached retry, unused-credit refund burn/source transfer and final refundable liabilities. Exercise rejection, reload, original-seed recovery and passkey/password fallback. Never mark physical-wallet acceptance complete from the SDK automation harness alone. No real funds, mainnet, or paid-provider call is part of this procedure.
