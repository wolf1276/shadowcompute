# Privacy model

| Information | Exposure | Location |
|---|---|---|
| Note owner secrets, salts, reward checkpoint/carry | Private | Client witnesses/private-state store |
| Number of lots owned and aggregate individual position | Private by cryptographic ownership, subject to traffic correlation | Client notes |
| Each deposit lot size, reserve unit size, aggregate principal/reserve/allocations | Public | Contract ledger and transaction effects |
| Contract-held coin values, color, fresh nonces and tree indexes | Public | Principal/reserve coin maps |
| Note commitments and tree insertion timing | Public | Append-only trees |
| Spent note/credit nullifiers, receipt hash/expiry | Public | Contract ledger |
| Which position/credit leaf is spent | Private | Witness Merkle path, checked in ZK |
| Funding wallet keys and original wallet coin nonces | Not deliberately published | Shielded wallet/Zswap |
| Withdrawal payout metadata | Potentially correlatable | Derived public coin nonce; do not claim recipient anonymity against guessed keys |
| Fee payer/relayer metadata, circuit names, timestamps | Observable | Chain/network |
| Bearer receipt preimage | Private to client and gateway | Off-chain request |
| Prompts/responses | Visible to gateway/provider; never on-chain | Gateway/provider and response cache |
| IP address, request timing | Visible to gateway/transport | Off-chain infrastructure |

There is NO guarantee that deposit amounts are hidden: each lot amount and transaction count are public. Fixed lots and hidden membership conceal which and how many lots a user owns, not transaction timing or external knowledge. A one-user anonymity set provides essentially no activity privacy. Use a distinct fee-paying relay wallet for redemption to avoid directly reusing the funding wallet; this MVP offers a headless relay, not an anonymous transport. Minting from the public demo faucet can expose who initially received a known coin. Deposits always create fresh contract coin nonces rather than reuse wallet coin nonces.

Position commitments, position nullifiers, credit commitments, credit nullifiers and gateway receipt bindings have distinct labels and include the vault instance address. Credit secrets must be fresh and independent of position secrets. Private paths prove membership against the current tree root. Roots may go stale under concurrency; rebuild and reprove rather than accept stale state blindly. Never back up raw secrets into git, logs or public deployment records. Backend headless clients hold their own private notes; the inference gateway receives no wallet seed or note secret.

Public-state inspection tests search all ledger byte fields recursively for secrets and wallet keys. This detects direct leakage, not statistical correlation or a complete audit of transaction encoding.

## Deployment maintenance trust

These local deployments use Midnight.js default maintenance authority. The deployment operator retains an SDK-generated signing key in the encrypted private-state store and can update contract verifier keys. Ownership/solvency guarantees assume that authority is honest and uncompromised; `sealed` protects against ordinary circuits, not a malicious maintenance update. The inference gateway also trusts that the configured contract code has not been replaced. Removing or independently controlling maintenance authority is a required public-release gate; this MVP does not claim immutable or trustless custody.

## Local AI demonstration

OpenCode receives the prompt and pinned Compact skill through an isolated text-only process. Ollama sees that content on the same machine; the model has no wallet keys, note secrets or agent tools. Gateway SQLite stores prompt digests and returned answers; the demo intentionally saves its generated public contract source and compiler diagnostics. This is local inference, not a cryptographic guarantee against the host operator. A skill reduces errors but does not enforce correctness: the compiler gate checks syntax/types, and the separate deployment harness checks only its specified 12 behaviors.

## Browser terminal trust boundary

In the original file-backed demo mode, the terminal is a local wallet client separate from the inference gateway. It reads a selected demo credit directory and invokes the relay client. That mode sends credit filenames, prompts and answers to the browser while keeping note openings and bearer credentials in local files. Its history is process-memory only; no third-party analytics/fonts/scripts are loaded. Requests are still visible to the local terminal process, gateway and model. Loopback binding and browser-origin checks do not protect against a compromised local OS. Never host this wallet bridge publicly.

## Browser-owned Vault notes

The Vault stores position openings, claim secrets, allowance receipts, chat history and pending journals encrypted with AES-256-GCM in browser storage. PBKDF2-SHA-256 with a per-store random salt derives the key from the user's vault password (250,000 iterations). A fresh IV protects each save. Network, vault and wallet account are authenticated as additional data. The password is not sent to the server. Backup files retain this encryption; restoring with another wallet, network or password fails authentication. Site data loss without backup can lose note ownership; wallet seed recovery alone does not restore app-specific randomness.

This implementation uses a trusted local Node client and local proof server, not browser-only proving. During a vault action the browser sends the necessary note opening to that loopback service. The service constructs the proof, asks the extension to balance/approve/submit, and removes the temporary SDK private-state entry after completion. Wallet keys never leave the extension. The service can observe the opening while processing it; a compromised host breaks this privacy boundary. It must not be exposed as a public wallet server. Vault operation identifiers are random capabilities and private jobs are not listed by the ordinary terminal state endpoint.

Allowance redemption sends the independent credit secret and bearer to the local relay without the deposit note, wallet address or position opening. The separate inference gateway receives only the prompt and anonymous finalized receipt credential. That separation avoids explicitly mapping a deposit wallet to inference in the gateway API; timing, local-process observation and a small anonymity set still permit correlation. Browser allowance refresh verifies commitment/spent membership against indexed ledger data; meter state is not a claim about unclaimed future rewards.

Browser Web Locks hold a per-account/network/vault writer lock while notes are unlocked. The app denies a second tab access to the same writable store; locking closes it and prevents an asynchronous encryption operation from writing after lock release. This guards ordinary concurrent app tabs, not malicious same-origin code or a compromised browser.

## Optional Mera passkey unlock

Mera 0.2.0 encrypts a scope-bound copy of the existing vault recovery password under a passkey PRF-derived key. The encrypted wrapper is included in the local note envelope and encrypted backups. An assertion decrypts it locally, checks the wallet/network/vault scope, and opens the existing PBKDF2/AES-GCM store. No password, PRF output or passkey wrapper is sent to the backend. Temporary byte buffers are cleared; JavaScript strings and browser memory are not guaranteed erased.

Password recovery remains enabled, so passkeys add an unlock route without eliminating the recovery password's offline-guessing risk. A compromised page/browser can access secrets while unlocked. Passkeys are tied to a relying-party hostname and their availability/synchronization depends on the authenticator. They do not recover deleted note ciphertext. Moving from 127.0.0.1 to localhost requires explicit encrypted backup/restore because browser storage is origin-specific.
