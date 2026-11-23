# Threat model

Adversaries may submit arbitrary Compact arguments/witnesses, reuse salts, forge paths, race claims/redemptions and replay HTTP requests. Every authorization is constrained in Compact, not trusted from witness code. Domain-separated instance-bound note commitments authenticate checkpoints and carry; a spent-nullifier set prevents branching histories. Exact denomination/token checks precede receive effects. Principal coins can only leave through an owned unspent position; reserve coins only through a valid unspent credit. Funded allocation counters prevent oversubscription. Sealed rate prevents historical rate manipulation. Clock advancement is authenticated and monotonic, bounded to ten simulated years.

The gateway rejects absent/expired/mismatched receipts, accepts only the configured contract and chain source, uses transactional durable replay state, bounds HTTP bodies, and avoids prompt/access logs. A receipt is a bearer authorization; stealing its preimage can steal the request. TLS is required when exposing beyond loopback. Request expiry limits first admission; admitted retries survive expiry for reconciliation. The database caches sensitive responses and must remain protected on disk. Single-process in-flight locking plus SQLite status guards concurrent requests. Crash-uncertain requests do not automatically retry paid providers.

Residual risks: trusted indexer/finality, shared/devnet test seeds, test faucet unlimited supply, finite Merkle tree capacity, public timing and balances, trusted clock and gateway, denial of service/tree exhaustion, no audited production deployment, installed-wallet Preview acceptance still open. Keys and proofs require substantial disk/CPU resources. Provider-visible prompts are not private inference.

## Dependency audit, 2026-11-21

`npm audit --omit=dev --json`: initially 28 moderate; final lockfile after removing unused direct dependencies reports 26 moderate, 0 high, 0 critical findings in the pinned SDK/testkit transitive tree (including @effect/platform, glob/minimatch, uuid, Docker/testcontainers dependencies). Some package-level findings are propagation of the same root advisory. These have NOT been treated as resolved. A forced major-version update would break the verified Midnight toolchain and was not performed. Keep this build local-only; review upstream compatible fixes before public operation.

## Deployment maintenance trust

These local deployments use Midnight.js default maintenance authority. The deployment operator retains an SDK-generated signing key in the encrypted private-state store and can update contract verifier keys. Ownership/solvency guarantees assume that authority is honest and uncompromised; `sealed` protects against ordinary circuits, not a malicious maintenance update. The inference gateway also trusts that the configured contract code has not been replaced. Removing or independently controlling maintenance authority is a required public-release gate; this MVP does not claim immutable or trustless custody.

## Generated-code boundary

AI output is untrusted. OpenCode runs without tool permissions in temporary storage with an environment allowlist. Source imports/includes are restricted and input/output/compile time are bounded. Actual syntax/type checking cannot prove authorization correctness: the dedicated PrivateBudget harness checks 12 specified behaviors before local deployment. It is a narrow demo, not a general smart-contract auditor or sandbox for arbitrary adversarial generated JavaScript. Never deploy arbitrary model output with real funds. Skill context is guidance, not enforcement.

## Mera passkey scope

Passkey enrollment/unlock is local PRF-based secret decryption, not backend identity authentication or transaction signing. Password recovery remains an alternative, including for unsupported PRF. Wrong encrypted wallet/network/vault scope or RP hostname is rejected. Malformed optional wrapper metadata cannot block password-based note recovery. Cancellation, an enrollment write failure or locking during enrollment must leave the original encrypted store usable. These paths are regression tested with a simulated authenticator and actual Mera cryptography; physical Brave/authenticator behavior remains unverified. Passkey loss plus password loss, or loss of the latest note backup, can still lose access.
