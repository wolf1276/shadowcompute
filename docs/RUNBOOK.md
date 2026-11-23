# Backend operations and recovery

## Private notes

A note is a bearer asset: the secret and opening authorize a ZK spend. Back it up locally with owner-only permissions. `savePrivate` uses an atomic rename, 0600 files and 0700 directories; the SDK additionally encrypts its private-state store with PRIVATE_STATE_PASSWORD. CLI note backups are plaintext on the user's machine. Neither belongs on a server shared with the inference gateway in a production deployment.

The CLI writes a `.pending` journal before an owned transaction. Never blindly discard it or regenerate secrets after a timeout. The transaction may have finalized even if the client did not receive the response. Use the indexer to check note commitment membership and its spent nullifier with the generated `pureCircuits` functions, against the known vault address. Do not submit secrets to an RPC server.

For an interrupted deposit, the saved note is the opening of its position commitment. It exists iff that commitment was inserted. For an interrupted claim, journal contains old note and expected simulated time. The new note uses the old `nextSalt`, unchanged owner secret, checkpoint equal to expected time, and `old.carry + lotSize * apyBps * (expectedTime-old.checkpoint) - rewardUnit * 31536000 * 10000`. The claimed credit secret is the old note's `creditSecret`. Verify the corresponding leaves exist before replacing local state. Generate fresh future `nextSalt` and `creditSecret` only for the next claim. For interrupted redemption, derive its nullifier and receipt binding from saved credit secret and bearer, and check the public receipt. Do not pay again. Withdrawal consumes the old position nullifier; a present nullifier confirms its spend.

CLI recovery deliberately requires inspection; it does not guess whether an unknown transaction succeeded. The pending journal must be retained until both ledger and local note state are reconciled. A reset devnet is a different chain: its prior notes and manifests are unusable.

## Inference failures

One paid receipt admits exactly one prompt digest. Successful repeats return the cached response, including after receipt expiry. A known rejected provider call marks `retryable`; the user retries the same body without another on-chain payment. Ambiguous network failures, malformed success responses and process crashes may have executed inference remotely. Such requests remain `uncertain`/`pending` and return HTTP 409 on replay. This avoids silently spending another credit or blindly issuing duplicate provider calls.

Stop the gateway before operator reconciliation. Confirm the remote call's actual outcome before changing a request:

```sh
GATEWAY_DB=.private-states/gateway.db npm run reconcile -- NULLIFIER complete 'Recovered provider response'
# Only after confirming the provider did NOT complete the earlier request:
GATEWAY_DB=.private-states/gateway.db npm run reconcile -- NULLIFIER retry
```

The second path may execute another provider request under the SAME paid receipt. There is no automatic on-chain refund and no claim of exactly-once provider execution under process/network failures. The operator is trusted to deliver service/reconcile settlement. Gateway settlement was paid at redemption; a withheld service remains an operator liability. Preserve the database and WAL through restarts. Do not log prompts, credentials, wallet identities or entire provider errors.

## Network and release boundary

Local devnet uses public genesis wallet seeds and an unrestricted test-token faucet. Docker ports and HTTP API bind only to loopback. Running an internet-facing deployment requires TLS, operational hardening, independent security review and real secret custody. The configured proof server sees proof preimages: use a trusted local instance, not an untrusted hosted prover.

Never change compiler/proving keys beneath running tests or an old deployment. Recompile, then deploy the matching contract. Compile and simulator success do not imply chain verification; run `npm run test:local`.

## Local Compact coder

Follow the README GPU setup. The gateway does not start Ollama: keep `npm run ai:gpu` running on 11435. Restart the gateway after changing adapter/model/skill settings. The Compact skill is injected as reference text; tools, filesystem access, plugins and delegation remain disabled. Generated code is untrusted: only the controlled compiler and the dedicated demo harness process it.

`npm run demo:compact -- CREDIT_NOTE` saves each run under a fresh `artifacts/generated-budget-TIMESTAMP` directory. It reuses any saved redemption, checks the answer with real proving keys and 12 semantic/privacy assertions, then deploys and proves a spend. It never repairs source manually. Keep failed outputs and receipts; identical prompts can retry a known failure without another redemption. Do not change the demo prompt while retrying a bound receipt. The compiler-guided adapter has at most three drafts per execution, not a lifetime cap on retries.

Set GATEWAY_DB to the same database as the gateway when reconciling. An uncertain local-model call still requires checking that no inference is active before retry. This may repeat local computation but never charges a second on-chain credit. Generated demonstration contracts retain deployment maintenance authority and are not audited.

## Local agent terminal

After preparing credits with npm run demo, run npm run terminal and open http://127.0.0.1:8790. The credit directory is selected at startup from demo-latest.json (or TERMINAL_CREDIT_DIR, restricted to .private-states). This loopback service can read the chosen demo notes and runs the existing relay/ask client; keep it private to the local machine. A session token, Origin/Host checks and one in-flight request protect the browser bridge. The page never receives the note opening or bearer receipt.

Do not restart the terminal or change its credit directory during an active proof/inference. Requests can continue after closing the browser. Reopening reconnects to in-memory history while the process lives. Restarting loses that UI history, so preserve the original prompt and receipt for recovery. No automatic refund or ambiguous transaction resubmission is added by the UI. Use the existing reconciliation procedure when necessary. Credit availability means unredeemed local note files, not a live balance oracle.

## Deployment recovery

The CLI writes an owner-only `artifacts/deployment.<network>.json.pending` (or `artifacts/deployment.json.pending` locally) and saves the admin state before submitting a deployment. After token deployment returns, the journal records its address, transaction and token color before starting the vault. The CLI refuses another deployment while a manifest, journal or admin file exists. If a deployment is interrupted, preserve the journal, admin state and SDK private stores, then inspect the chain/indexer before any recovery: an operation can finalize without returning to the client. A journal that still says `deploying-token` does not prove that token deployment failed. Do not blindly retry or delete the existing admin state.

## Private Vault browser workflow and recovery

Use the Preview terminal's Private vault tab. Connect a Ledger 9-compatible Midnight wallet, unlock with a local vault password (at least 16 characters), and download an encrypted backup. The browser creates private note randomness independently of the wallet seed. Keep the password and backup safe; the wallet seed alone does not reconstruct these notes.

Mint one supported test-asset lot with Get test assets, then Deposit one lot. Both ask the extension to balance/approve and submit real transactions. The local service constructs the proof and must be trusted. The wallet needs native test DUST for its own fees; the application does not request more faucet NIGHT automatically.

The public Preview clock currently starts at zero. After a deposit at zero, an operator can advance to absolute checkpoint 3153600 with `npm run client:preview -- advance 3153600` to model 36.5 SIMULATED days. Inspect the current clock first and choose a strictly later checkpoint. Claim becomes available only with enough accrued numerator and unallocated reserve. Reserve exhaustion never blocks principal withdrawal. Withdrawing forfeits that position's unclaimed simulation rewards.

The browser saves an encrypted pending journal before requesting a transaction and saves each wallet-request ID before answering it. A known failure before submission can be retried; an unknown or possibly submitted operation remains pending. Check pending transaction first polls the existing operation, then can compare the original/rotated note commitments and nullifier against indexed ledger data. It never blindly creates a replacement. If a mint's outcome or a rejected transaction remains unresolved, reconcile the saved transaction ID in wallet/indexer history before changing the encrypted journal. Do not manually discard a note because a browser timed out.

AI requests from the unlocked Vault store reserve an independent allowance secret/bearer and prompt in the encrypted journal. The relay redeems with its own wallet; inference sends no deposit opening or wallet address to the gateway. Retry the same prompt and allowance after failure. Unknown results, first-admission expiry or a lost bearer need operator reconciliation; there is no automatic on-chain refund.

Refresh allowance checks commitment/spent membership. An old backup can miss a later transaction; retain newer backups and transaction history. Locking hides private position data and disconnecting clears the page connection, but revocation belongs in the wallet's permission settings. Do not expose this loopback proof/wallet bridge publicly.

### Preventing stale backup data loss

Encrypted note saves take an immutable snapshot and reject overlapping writes. Retry a rejected save only after the current operation settles; do not replace a pending transaction. Import into a vault containing positions, credits, history, inference requests or a pending journal is refused. To inspect or recover an older encrypted backup, use a separate empty browser profile with the original wallet/network/vault and password, then refresh and reconcile on-chain state. Keep the newer browser store and latest backup intact. Restoring a stale backup cannot reconstruct notes created after that backup.

### Mera passkey unlock

Use `http://localhost:8791` for Preview or `http://localhost:8790` locally. The IP-hostname page disables passkey controls and explains how to move notes safely: download an encrypted backup before switching, connect the original wallet on localhost, select the backup and unlock with its recovery password. The two hostnames have separate browser storage.

Unlock with the existing recovery password, settle any pending operation, and select **Enable passkey unlock**. The browser performs Mera's PRF-capable passkey ceremony. Download a new encrypted backup after success. Later, connect the same wallet and choose **Unlock with passkey**; wallet transaction approvals remain separate. Do not delete or rotate the recovery password: it remains the recovery route if the passkey is lost or PRF is unavailable. The wrapper is encrypted within the backup envelope; passkey possession alone cannot reconstruct missing notes.

The browser bundle is built automatically by `npm test`, `npm run terminal`, `npm run terminal:preview` and `npm run test:wallet`. Run `npm run build:browser` after direct script invocation or a clean install. Use Node 24, as required by Mera 0.2.0. Both note encryption and the passkey wrapper stay in the browser; this does not alter the documented trusted-local proof construction path.

Cancelled/unsupported ceremonies leave the password vault intact. If passkey metadata is malformed, successful password unlock preserves note recovery and permits fresh enrollment. A valid-format wrapper with damaged ciphertext fails passkey authentication while password unlock remains usable. Keep the original backup when diagnosing either case. No browser/device compatibility claim follows from the simulated-authenticator tests.

### Reading the setup guide and progress

The guide follows local encrypted note state and confirmed history. A downloaded recovery backup is only acknowledged when the user explicitly confirms saving it and the recovery password. This is not proof that a file exists on disk. Save another backup after deposits or claims. The guide never sends a replacement for a pending transaction; it points to the existing reconciliation action.

Wallet actions report preparation, wallet approval, submission and confirmation from the actual bridge. Relay authorization reports its own connection/balancing/submission stages. AI requests switch to waiting for the gateway response after receipt acquisition; that stage includes gateway validation, model execution and any compiler repair. It does not claim to expose individual internal model tokens or compiler attempts. Elapsed time has no predicted completion percentage. Keep the page open, and preserve journals/receipts if interrupted.

Gateway `/health` reports the configured adapter, which the terminal exposes in its authenticated session state. Unknown adapter mode does not offer prompts. Compiler mode uses the exact task from `demos/compact-prompt.txt`, emitted into a same-origin browser module by `npm run build:browser`; explanation prompts appear only for text adapters. After changing gateway adapter configuration, restart the idle terminal to refresh its capability metadata.
