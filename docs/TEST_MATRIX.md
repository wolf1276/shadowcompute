# Tested security invariants

| Requirement | Executed checks | Boundary |
|---|---|---|
| No unauthorized withdrawal | Wrong owner secret/forged opening; mutated witness Merkle path; real-client unauthorized withdrawal rejects | Runtime simulator + real devnet |
| No double claim/withdraw/redemption | Spent sets checked in Compact, old notes rejected, same HTTP receipt only caches same prompt | Simulator + real devnet + gateway |
| Principal solvent | Sum of principal coins = aggregate principal through four deposits/withdrawals; real final wallet balance restored | Simulator + real devnet |
| Credits funded | Reserve denomination/color validation; issuance <= reserve; exhausted reserve rejects claims; redemption decrements reserve and allocation | Simulator + real devnet |
| Invalid proofs fail | Corrupt real proof response, node rejects transaction (115), unchanged public counter | Actual proof server/node |
| Reused nullifiers fail | Repeated note/credit spends fail, changed prompt cannot reuse receipt | Simulator + real devnet + gateway |
| User separation | Mixed user secrets/openings fail; credit secret required, relay lacks position secret | Simulator + real devnet |
| Inference failure policy | Known failure retry; cached completion after restart; pending/uncertain blocks automatic retries; concurrent SQLite instances | Gateway tests + documented operator reconciliation |
| Secret ledger isolation | Recursive public-byte inspection for admin/position/credit secrets, salts, funding wallet key and wallet coin nonces | Simulator + actual indexed ledger |
| Time/accounting boundaries | Constructor limits, no backwards/future simulation, immutable rate, fractional carry, late deposits, forged historical checkpoint, stale claim time | Simulator + on-chain claim guards |
| HTTP/provider trust boundary | Body size, MIME, JSON/schema validation, sanitized failures, real adapter payload/auth against loopback server | HTTP tests |
| Secret persistence | Big integer/byte round-trip, atomic replacement, file mode 0600 | Filesystem test |

Simulator tests execute generated Compact code, not proofs. Only the dedicated local suite establishes actual transaction/proof acceptance. No finite suite proves universal security. Correlation privacy, production concurrency/load, public network and external provider availability are not established by these tests.

## Compact inference extension

The current offline/unit suite contains 27 tests, including isolated OpenCode process configuration, no forwarded gateway secrets, stdin prompts, timeout handling, skill injection, source restrictions, actual compiler failure/repair and cached paid-receipt retries. The compiler adapter's unit test runs the installed Compact compiler; it does not substitute a compiler mock.

The generated PrivateBudget harness additionally checks 12 properties with real generated bindings: initial accounting, authorized spend, rejected foreign owner, zero amount, over-budget amount, exact cap, exhaustion, raw-secret absence, only the intended exported circuit, invalid constructor, exact public ledger fields and Uint64 overflow. Real proving-key compilation and local deployment/proved spend are recorded separately in each artifact directory. The previously completed two real-network protocol tests remain separate from these 27 tests.

The terminal extension brings the offline/unit total to 30. Its HTTP tests check Host/Origin/session-token enforcement, secret/path exclusion from state, traversal and symlink rejection, request bounds, serialized admission, one-credit/one-prompt binding, completed-response caching and retry of a failed request without creating a second history entry. These transport tests inject an inference runner; actual browser-to-chain/model execution is reported separately in PROGRESS.md.

A real CLI subprocess regression also checks that retrying an unresolved redemption leaves its recovery journal unchanged and does not create a replacement receipt.

## Browser Vault extension

Encrypted-store checks cover AES-GCM confidentiality/authentication, wrong passwords, wallet/network scope, backup restore, pending journals and exact fractional carry. Browser wallet-key decoding rejects wrong-network credentials. Private operation IDs and one-use wallet request IDs are checked; same-origin/session-token HTTP guards cover the Vault endpoints, and ordinary terminal state does not expose private job identifiers/openings.

The new real local-node integration uses actual SDK wallets through connector-style serialized balance/submit requests (automated approvals, not an installed extension). It proves mint/deposit/claim/redemption/withdrawal, restores principal, rejects a declined approval, checks public state for note-secret leakage and validates/caches inference against an actual finalized receipt. That inference adapter is explicitly OFFLINE MOCK; prior real Ollama/OpenCode evidence remains separate. See artifacts/browser-vault-local.json. A manual installed-wallet Preview walkthrough remains a release/demo gate.

## Private note recovery hardening (2026-11-22)

The consolidated offline suite now contains 43 tests. New regressions verify that an overlapping save fails before it can overwrite an in-flight encrypted snapshot, caller mutation cannot change that snapshot, and restoring a stale backup into a populated vault is refused without changing its saved notes. Restore recovery remains available in a separate empty browser profile with the original wallet/network/vault and password.

## Mera passkey integration

The consolidated offline suite now contains 49 tests. Six new tests exercise the real Mera 0.2.0 secret-vault crypto through a simulated WebAuthn client: enrollment over existing positions/journals, passkey unlock, password fallback, backup recovery, unsupported PRF/cancellation, relying-party mismatch, encrypted wallet/network/vault scope mismatch, tampered ciphertext, malformed optional metadata and locking while enrollment is pending and storage-write failure rollback. Tests also serve the same-origin SDK/helper assets with JavaScript MIME types and confirm the UI controls and bundled license notice. Actual Brave/authenticator user verification remains a separate manual gate.

## Guided setup, passkey-first entry, real progress and adapter-aware prompts

The consolidated suite contains 55 tests across 13 files. Added coverage follows the setup transitions (including explicit backup acknowledgment, test assets and pending-operation recovery), supported/unsupported passkey presentation, exact reuse of the independently tested Compact task, mock/text/unknown adapter presentation, elapsed-time formatting, real bridge-request stage transitions, gateway health adapter metadata and a real CLI subprocess emitting progress for an already-saved receipt without another redemption. Same-origin asset transport includes the generated example task and experience module. TypeScript, JavaScript syntax and HTML/control-ID consistency checks pass. Actual Brave/physical authenticator and visual/keyboard/mobile walkthroughs remain manual acceptance gates.


## Current prepaid completion checks (2026-11-24)

66 offline tests across 18 files and 11 treasury tests (128 solvency fuzz cases) PASS on Node 24.18.0; TypeScript PASS. Added public-test configuration/secret-safe error checks and local/Preview/contract journal isolation tests. Public preflight is read-only and reports missing Sepolia RPC/key, not a deployment success. The resumed completed local demo passes using retained token logs when historical state is pruned and existing paid inference receipts; original proof/model evidence remains separate.

Actual browser checks: desktop layout, 390px viewport without horizontal overflow, keyboard focus to unlock, missing-extension guidance, current prepaid accessible labels and mobile button targets >=44px. Physical wallet/passkey acceptance remains unavailable. Direct local-model benchmark includes explicit exact-output failures and a partial GPU-energy boundary. See artifacts/completion-acceptance.json and docs/BUSINESS_VALIDATION.md.
