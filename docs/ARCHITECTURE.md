# ShadowCompute backend

Backend-only local-devnet MVP. No real funds, lending integration, frontend, or claims of private inference. Test token is an unrestricted faucet and has no economic value.

## Compatibility (verified 2026-11-21)
Use official midnight-examples Ledger 9 pins: compiler 0.36.1 / language 0.28, Midnight.js and testkit 5.0.1, wallet-sdk 2.0.1, proof-server 9.0.2, node 2.1.101, indexer 4.4.101, Node 22. The older private-contract guide is explicitly Ledger 8 and must not supply version pins. Exact upstream commit is recorded in THIRD_PARTY.md.

## Scope and trust assumptions, established before cryptographic implementation
The vault holds one shielded test asset. Deposits are fixed-size lots; a user can own multiple lots. Each lot is a private note in an append-only Merkle tree. Ownership is knowledge of a random secret and opening. An unlinkable nullifier spends the note once; a claim replaces it with a freshly salted checkpoint note. Pooled principal coins are interchangeable, so withdrawal does not identify the deposited coin. Partial withdrawal means withdrawing one whole lot. Withdrawing forfeits unclaimed simulated yield on that lot. Already claimed credits remain valid.

Yield uses a sealed APY and an administrator-controlled monotonic SIMULATED clock, never asserted to be wall or chain time. Claiming one credit consumes a deterministic quantity of accumulated reward numerator and locks one funded reserve unit. Sponsor reserve consists of exact one-credit coins to avoid change/fragmentation. No reserve-withdrawal function exists. Redemption proves membership of a credit note without disclosing its leaf, spends a domain-separated nullifier, and pays one reserve coin to the configured gateway settlement key. Principal and reserve pools are separate. All token movements use real receiveShielded/sendShielded effects, balanced by Midnight.js wallets, verified by the node.

Gateway accepts a random bearer preimage for a finalized on-chain redemption receipt. The receipt binds only a domain-separated hash of that secret, its nullifier, and a short real-chain expiry. It never accepts client assertions of finality. Midnight verifies the ZK proof; the gateway queries that configured contract through its trusted indexer. Receipt possession alone is insufficient without the bearer secret. SQLite provides persistent, atomic one-request charging; completed retries return cached output. Failed/uncertain inference is retryable under the same paid receipt; no second on-chain charge is required. A crash with an in-flight provider call requires explicit reconciliation, because exactly-once external inference cannot be guaranteed without provider idempotency.

Trust the configured chain/indexer, Compact toolchain/proof system, wallet/OS entropy and local secret storage, gateway settlement operator and database, and simulated clock administrator. A malicious clock can accelerate funded rewards, but cannot spend principal or create unfunded credits. A malicious gateway can withhold inference. Provider and gateway see prompt content. Test adapters never stand in for network proof verification.

Future optional adapters: real lending (only after validation), Sig Network/Aave, proof batching and larger note trees. None are required by this backend iteration.

## Deployment maintenance trust

These local deployments use Midnight.js default maintenance authority. The deployment operator retains an SDK-generated signing key in the encrypted private-state store and can update contract verifier keys. Ownership/solvency guarantees assume that authority is honest and uncompromised; `sealed` protects against ordinary circuits, not a malicious maintenance update. The inference gateway also trusts that the configured contract code has not been replaced. Removing or independently controlling maintenance authority is a required public-release gate; this MVP does not claim immutable or trustless custody.

## Compiler-guided local inference

The production-style HTTP provider remains configurable. The demonstrated local adapter is OpenCode text inference → loopback Ollama → Qwen 2.5 Coder 7B Instruct, with a pinned Compact skill injected explicitly. No tools, plugins, wallet environment or project access are delegated. `opencode-compact` performs up to three real compiler syntax/type checks and diagnostic repairs per execution. A failed attempt preserves the paid receipt; independent real-key compilation and the generated-contract harness are required before local deployment. These are distinct gates: syntax does not establish authorization or proof acceptance.

## Optional Corral-style local terminal

Original static browser UI → authenticated loopback console → existing headless credit client → actual Midnight redemption → inference gateway. The console's Origin/Host checks and ephemeral session token defend the local HTTP boundary. Only credit filenames and in-memory request/response history reach the browser; wallet note secrets and receipt bearers do not. It has one in-flight request and keeps retries bound to their original credit and prompt. This local client is intentionally separate from the gateway's proof-backed authorization and cannot fabricate a successful chain receipt.

## Mera note unlock

The optional passkey layer runs entirely in the browser. `vault-passkey.js` uses the pinned, bundled Mera secret-vault API; `vault-store.js` preserves the existing note encryption and embeds the encrypted passkey wrapper in backups. The browser unlock UI supports enrollment after password unlock and later passkey assertions. Node 24 is the supported development/runtime baseline. Contracts, provider authorization, extension approvals and the inference-receipt protocol are unchanged.
