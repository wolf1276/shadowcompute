# Vercel interface + this computer as demo companion

This is the selected deployment architecture: Vercel hosts only the static interface. This computer continues to run the actual Midnight client/prover, durable gateway/relay state and local GPU inference. Contracts live on their respective chains. SQLite, seeds, private notes, proving keys and model weights are not uploaded to Vercel.

The public prepaid Sepolia/Preview deployment remains separate and pending. Hosting the interface does not migrate local contracts to Preview or create a public inference service.

## Deploy and connect

The Vercel project uses the repository-root vercel.json, installs only the isolated apps/web dependencies, and publishes a checked allowlist of 16 static assets. GitHub pushes to main trigger deployment. `npm --prefix apps/web ci` then `npm --prefix apps/web run verify` reproduces its build. Node 24 is required.

1. Keep Docker Midnight node/indexer/proof services and local GPU model running. Start `npm run gateway:prepaid`.
2. Start `TERMINAL_ALLOWED_ORIGIN=https://YOUR-PRODUCTION-DOMAIN npm run terminal:prepaid`. Use exactly one HTTPS origin, without a trailing slash, path or wildcard. Server remains bound to loopback.
3. Open http://localhost:8792/pair locally. Copy the private pairing code; never share it in a URL, chat, log or screenshot.
4. Open the deployed Vercel interface. Set the local URL to http://localhost:8792 and paste the code. Allow the browser's local-network prompt if shown.
5. Connect the installed wallets and use the existing application flow. The connected browser must run on this same computer. A phone or another computer cannot reach this computer's localhost.

Each companion restart changes its code. Use the Companion button on the hosted interface to pair again. Pairing is held in sessionStorage for this browser tab, not an account system or a public API credential.

## Security and recovery

Remote session/code discovery is forbidden, even for the approved origin. Only the pinned origin receives CORS/preflight responses and only authenticated API calls can access data. An arbitrary Vercel preview URL is not approved automatically; preview builds stay unpaired unless explicitly selected as the single companion origin. Hostname suffixes and wildcards are not trusted.

The pairing code authorizes the hosted JavaScript to use the local application, including processing note openings for proofs. Trust and review that deployment. Wallet signing keys remain in the extension and transactions still need wallet approval. Do not expose the gateway, proof server or companion ports to the internet. The fixed local origin and code are not a replacement for hosted multi-user authentication.

Browser storage and passkeys belong to their origin. Existing localhost encrypted notes are not automatically available on the Vercel domain. Export an encrypted backup locally, keep its recovery password, restore in an empty hosted vault under the same wallet/network/contract, then refresh/reconcile. Use password recovery across origins; enroll a new passkey for the new origin. Do not overwrite newer notes or delete pending journals.

If a browser refuses loopback access from HTTPS, follow its local-network permission controls or use the existing localhost UI; do not disable browser security. A fully independent hosted backend needs persistent compute, durable database/storage, protected issuer keys, a proof service and an inference provider, with a fresh security review of the changed custody boundary.

## Current verification

The 69-test root suite includes positive/negative pairing, origin, token, preflight, local-session and loopback-validation tests. A separate deployment test checks the static allowlist, module resolution and CSP. TypeScript passes. Actual production and browser acceptance results are recorded in PROGRESS.md and artifacts/vercel-deployment.json after deployment, without publishing the pairing code.


## Live deployment and idle state

Production: https://shadowcompute.vercel.app . Repository: https://github.com/wolf1276/shadowcompute . GitHub main is connected to the Vercel project. The local .env.prepaid has the exact production origin configured; it remains private and untracked.

Stop the demo with `docker compose stop`, not `docker compose down`: this existing local node/indexer stores chain state inside its containers. Stop preserves those layers; removing/recreating them can invalidate current local manifests and notes. `npm run env:down` now stops instead of removing containers. Gracefully stop the native Anvil process so its existing .private-states/prepaid-anvil.json snapshot is saved. Stop the project gateway/terminal processes and native Ollama server/runners to release RAM/GPU. Preserve all wallet files, databases and private journals. Only restart when preparing the demo; existing containers should be resumed with `docker compose start --wait`.
