# ShadowCompute implementation and actual verification

Updated 2026-11-21 (Asia/Kolkata). Backend-only scope; frontend intentionally omitted.

## Milestone 1 — environment, compile, deploy and prove: PASSED

Files: root npm workspace, lockfile, toolchain.json, compose.yml, scripts/compile.mjs, smoke.compact, Midnight.js wallet/providers/config, protocol.local.test.ts.

Commands executed: `node --version` (22.22.3), `docker version` (29.4.1), `compact --version` (CLI 0.5.1), `compact update 0.36.1 --no-set-default`, `npx --yes npm@11.21.0 install`, `docker compose up -d --wait`, `npm run compile`, `npm run test:local`.

Current official examples' Ledger 9 pins were verified before installing dependencies. The older private-smart-contract guide explicitly warns its version examples are Ledger 8. All three Docker services became healthy. The actual compiler 0.36.1 produced JS, ZKIR, prover and verifier artifacts. The smoke contract deployed, a proved ping finalized, and ledger counter read back as 1. A proxy then corrupted an actual proof-server response; the node rejected submission with Invalid Transaction / Custom error 115, and the ledger remained unchanged. Evidence: artifacts/phase1.json.

Resolved issues: npm 10 failed with an Arborist edgesOut error, so installation used the official pinned npm 11.21.0. Initial Compact width/disclosure errors were fixed. Compiler is explicitly selected per command; the user's global compiler default was not changed.

## Milestone 2 — private shielded vault: PASSED locally

Files: shadow-vault.compact, contract/index.ts, witnesses.ts, client.ts, sim.ts, vault.test.ts, protocol.local.test.ts, notes.ts.

Working: real shielded test-token minting; exact-denomination fresh-coin deposits; interchangeable pooled principal; ownership and hidden Merkle membership constrained in Compact; one-time instance-bound position nullifiers; whole-lot withdrawal; multi-note conservation; rejection of unauthorized/double withdrawal and wrong assets/denominations. Public ledger privacy inspection checks wallet coin nonces, wallet key and note secrets are absent. Individual lot sizes and aggregate balances are explicitly PUBLIC. Real integration restored both deposited principal lots to the funding user's shielded wallet.

## Milestone 3 — funded simulated yield and private credits: PASSED locally

Files: vault circuits, typed witnesses, headless claim/redeem client, expanded simulator and real-network tests.

Working: sealed configurable APY; authenticated bounded monotonic SIMULATED seconds; exact numerator/carry accrual; late-deposit/historical-claim protection; clock-race rejection; separately funded reward units; allocation ceiling; claim note rotation; hidden credit-tree membership; one-time credit nullifiers; chain-time receipt expiry; actual reserve payout on redemption. Simulator checks exhausted reserves do not prevent principal withdrawals. Reserve funds cannot be swept by an administrative circuit.

Claim and redemption were actually proved and accepted by the local node. Redemption used a wallet separate from the funding wallet and only its private credit secret, not the funding user's position opening.

## Milestone 4 — inference gateway: PASSED locally

Files: gateway.ts, receipt-source.ts, server.ts, main.ts, gateway.test.ts, server.test.ts, scripts/reconcile.ts.

Working: configured-contract receipt reads pinned to the node's finalized head; cryptographic bearer binding; invalid/expired rejection; SQLite atomic admission and persistent replay/idempotency; one paid receipt per prompt; cached successful retries; retryable known failures; explicit reconciliation of unknown outcomes/crashes; HTTP input bounds; prompt/error redaction; mock adapter; configurable real chat-completions HTTP adapter.

The end-to-end HTTP inference call used the OFFLINE MOCK adapter, explicitly labelled in its response. LLM_URL, LLM_API_KEY and LLM_MODEL were absent, so no external model call is claimed. The provider adapter executed against a local HTTP test server, checking authorization, model, payload and parsed response. Gateway input contained no wallet key, position secret or prompt on-chain.

## Milestone 5 — integrated backend: PASSED locally

Files: scripts/client.ts, scripts/reconcile.ts, .env.example, README.md, architecture/privacy/threat/runbook/plan documents, public evidence JSON.

Actual successful full integration: 2026-11-21, approximately 338 seconds for the two real-network tests. `artifacts/local-e2e.json` records real deployment, deposit, claim and redemption transaction IDs. Flow: deploy test token + vault, mint to funding user/sponsor, fund two reserve units, deposit two lots, reject unauthorized operations, advance simulation, private claim, reject double claim/forged carry, private redemption by separate relay, reject reuse, verify finalized receipt, execute HTTP mock inference, cache identical retry, reject a different prompt, withdraw both lots and verify balances.

Measured final accounting: user principal restored = 2000000; outstanding allocated rewards = 0; redeemed credits = 1; remaining funded reserve = 10000. No real funds or public-network deployments used.

One earlier integration run failed as expected when the claim circuit was recompiled beneath its old deployment. It is not counted as success. Artifacts were held fixed for the successful fresh deployment and complete rerun.

## Checks

- `npm run compile`: PASS for smoke, test-token, all six vault entrypoints with real ZK keys.
- `npm run typecheck`: PASS.
- `npm test`: 21 PASS across Compact simulator, gateway, HTTP boundary and private-note storage suites.
- `npm run test:local`: 2 PASS with real proofs, including corrupted-proof rejection and complete backend integration.
- Fresh lockfile installation and CLI smoke checks: see final verification note below.
- Dependency audit: initial pinned install reported 28 moderate findings; removing two unused direct dependencies reduced the lockfile audit to 26 moderate, 0 high, 0 critical. Upstream-compatible remediation remains a release gate.

## Remaining limitations and next implementation step

No frontend/browser wallet connector by request. No public preview/preprod run, real lending pool, mainnet use, external LLM execution, or independent audit. Fixed denominations, finite 1024-leaf trees, visible amounts/timing/payout correlations, trusted local prover/indexer/gateway and simulation admin are documented. CLI private note files are plaintext on the client, permission-restricted; SDK private state is encrypted. Unknown client transactions need journal-based reconciliation. Unknown inference outcomes require operator reconciliation; automatic on-chain refunds are not implemented.

Historical next step (superseded below): connect real inference. Public-network funding is no longer part of the current local demo.

## Final clean-install and CLI validation

`npx --yes npm@11.21.0 ci` completed from the committed lockfile (430 packages installed; final audit 26 moderate). TypeScript and local tests passed again after the clean install. Current local test count is **21**, after adding a regression for a discovered wallet-runtime serialization interaction.

The separate file-backed CLI successfully deployed a new local token/vault, minted sponsor/user tokens, funded a reserve and deposited a lot. Its first claim rejected locally because the wallet import installs `BigInt.prototype.toJSON`, which defeated a JSON replacer and saved bigint checkpoints as strings. No claim had executed and no principal moved on that failure. Serialization now normalizes integers/bytes recursively BEFORE JSON.stringify; a regression reproduces the exact global prototype hook. The existing test note's integer representation was repaired without changing its secrets or ledger opening; its claim subsequently proved and finalized successfully. This validates cross-process note loading as well as the in-process flow. The earlier failed CLI attempts are not reported as successes.

The standalone gateway entry point started on loopback :8787; `/health` returned 200 and its SQLite database was verified 0600. Private-state root was hardened to 0700. A git exposure check found no private stores, raw note files, .env or generated proving artifacts among nonignored files. An ignored 0600 `.env` records only the disposable local network, test-only private-storage password, actual local vault address and mock provider settings; no real wallet/provider credentials are present.

The repaired CLI then completed a real separate-wallet redemption and principal withdrawal. The standalone gateway accepted its finalized receipt over HTTP, returned an explicitly labelled mock response, and cached an identical retry without another charge. Public evidence: artifacts/cli-verification.json. Local Docker services and the mock gateway remain running; no external inference provider has been called.

## 2026-11-22 — real local AI and Compact skill

Files changed: OpenCode/Compact inference adapters and tests; main gateway wiring; GPU runtime launcher and local provider/model config; Compact skill; credit demo/ask/generated-contract checker/deployer scripts; package scripts, environment example, README and architecture/privacy/threat/runbook/test documents. No frontend was built.

Actual commands: `npm run ai:gpu`, `npm run ai:coder:pull`, `npm run ai:coder:configure`, `npm run gateway`, `npm run demo`, `npm run demo:compact -- .private-states/demo-1795280779270/credit-3.json`, `npm run ask -- ...` with the identical prompt, `npm run typecheck`, `npm test`, skill quick_validate, Node script syntax checks and bash -n. The demo internally runs `check:generated` and `deploy:generated`.

Current verification: TypeScript PASS; 27 unit/offline tests PASS. The original two actual-network protocol tests passed earlier and were not rerun merely for documentation/model changes. The separate AI-generated PrivateBudget compiled with real proving keys and passed all 12 behavior/privacy checks. Existing successful manual repair/deployment evidence remains in artifacts/generated-budget. The newer automated run and deployment evidence are recorded separately rather than overwriting it.

Actual AI: OpenCode 1.18.34 → local Ollama 0.23.0 → Qwen 2.5 Coder 7B Instruct on the existing RTX 4060. The shadow-compact-coder alias sets temperature zero and real 8192-token context, without new/trained weights. The skill is explicitly inserted into system and user reference context; no agent tools, plugins, wallet environment or files are delegated. Compiler guidance checks syntax/types, not proof/security. Full key generation, 12 behavior assertions and actual node verification are independent gates.

Failures retained: hosted free OpenCode quota/unconfigured upstream; inadequate 0.5B output; OpenCode steps=1 suppressing a first answer (fixed at 2 with tools still denied); invalid syntax, missing assertion messages and incorrect Uint64 casts in model drafts. The skill now gives explicit valid assertions, private ownership and checked arithmetic. Bounded compiler attempts reject bad drafts. A stopped local model caused an uncertain request; after confirming no active call/no returned answer, the operator reconciled the same receipt for retry. No new on-chain credit was paid for those retries. Earlier failed drafts and runs remain distinguishable from successful output.

Three funded credits were proved from accelerated SIMULATED yield and principal returned (artifacts/demo-latest.json). This is funded local test-token accounting and local GPU service access, not real earnings or purchased Ollama/OpenCode subscription credits. One public faucet request was submitted earlier but arrival was unconfirmed; no public deployment is claimed and no further faucet requests are needed or planned.

Remaining blockers: none for the tested local slice; public deployment, production hardening and independent review remain outside the demonstrated result. Keep local Ollama, gateway and Midnight services running. Models can still fail; preserve the original receipt, inspect diagnostics and retry the same prompt rather than paying again. The SDK default maintenance authority remains trusted; 26 moderate dependency audit findings remain unresolved. Next implementation step: rehearse the documented backend demo; frontend remains deferred by request.

Final automated result: PASS. Local SDK network ID `undeployed` means this local devnet. Generated contract 49bc5147f6e1e3410f3d2fbd200f696d15375ce7f94ce47a9866f2fc4da65352 deployed in transaction 00863a0539ad24dc9cb3084b9fb1282db0475301ae82804efb744ca51da53a229a; owner spend proved in 0031f502e0b370dc41b93ba46156f9f8b044ab6d68993c85276bc8923462b7881d. Wrong owner and over-budget calls rejected; public raw-secret inspection passed; spent 4 of cap 10. Final source is artifacts/generated-budget-1795306341701/private-budget.compact. Combined evidence: artifacts/opencode-compact-demo.json. An identical HTTP retry returned cached=true, and SQLite inspection found exactly one completed admission for that paid receipt. Midnight Docker services and loopback gateway were healthy at completion.

## 2026-11-22 — Corral-style credit-funded browser terminal: PASSED

The user explicitly requested a terminal UI after the backend-only milestone. Cloned https://github.com/arko05roy/corral to a temporary reference directory and inspected UI layout, terminal handling, styles, package metadata and commit cf1b30e79c4ef2cfa95a8d955b62f6fef41102ae. No license file was found. The visual layout was recreated with original HTML/CSS/JavaScript; no Corral source/assets/dependencies or Electron daemon were copied.

Files: packages/terminal/{index.html,style.css,app.js}; packages/backend/src/terminal.ts; terminal.test.ts; scripts/terminal.ts; scripts/ask.ts JSON-output and unresolved-journal guard; package script, .env.example, README, attribution and architecture/privacy/runbook/test docs. Added a valid Counter primitive example to the Compact skill after the model failed the first counter attempt.

Commands: npm run typecheck; npm test (30 PASS across 7 files); focused terminal Vitest (2 PASS before adding the third journal regression); node --check packages/terminal/app.js; skill quick_validate (PASS); npm run demo; npm run terminal. No new npm dependencies.

Actual demo: prepared three fresh reserve-backed credits and returned principal (artifacts/demo-latest.json). Opened http://127.0.0.1:8790 in the browser; verified responsive sidebar, privacy tab, credit selector, request-in-progress recovery after reload, and completed generated Compact response. A browser prompt redeemed credit-1 via actual Midnight transaction 0049eef8e5134f75c382ef49d9fb4c65c0cee651af3b7513a33ce661ba51aaf4d8. The first model/compiler attempt failed, with receipt marked retryable; clicking same-paid-request retry after improving the skill succeeded without another redemption. The returned Counter source passed the actual syntax/type compiler gate. It was not deployed by the terminal.

Proof of work: artifacts/terminal-demo.json, terminal-counter-answer.txt and terminal-inference.png. Repeated console submission returned the same history job; actual gateway replay returned cached=true. SQLite inspection found exactly one completed admission. Two unredeemed local credit files remain. All credit note/bearer files remain ignored; HTTP state tests verify secrets and private directory paths are absent.

Working capabilities: prompt entry, real one-credit redemption/inference, local history, same-paid-request retry, response copy/download, credit availability and privacy explanation. Model is currently Compact-focused; general text mode uses the existing AI_ADAPTER=opencode configuration.

Boundaries: loopback-only trusted demo wallet client, not a hosted multi-user wallet. History is in memory, and the selected credit directory is fixed until an idle restart. Availability counts unredeemed local note files, not an indexed wallet balance. No arbitrary shell access, browser-wallet connector, full deposit UI, Electron/git feature clone, real yield or public deployment. The small in-app browser viewport was visually checked; no pixel-perfect desktop comparison or independent security audit was performed. Next step: run the local terminal demo with the remaining credits; do not expose this wallet bridge publicly.

## 2026-11-22 — public Preview deployment preparation

Requested deployment to Midnight: the existing vault/test-token deployment on the local Midnight devnet remains recorded in artifacts/deployment.json. Public Preview is a separate network. Official current release notes confirm Preview Ledger 9 and the pinned SDK/Compact versions; Preview was reset in November, so previous-chain balances cannot be assumed. RPC and indexer HTTP endpoints answered successfully. A read-only wallet sync/funding preflight was started using the existing Preview sponsor; this does not request faucet funds or submit transactions. Outcome is recorded after the preflight.

Hardened scripts/client.ts and deployDemo to preserve the private admin state and a deployment journal, recording a completed token deployment before attempting the vault. Subsequent deploy commands refuse to overwrite a deployment, journal or prior admin state. TypeScript and the full 30-test suite passed. Interrupted transaction outcomes still require chain/indexer reconciliation, since submission can finalize before the client receives a response.

### Preview deployment completed

After an initial sync timeout, the existing sponsor wallet synchronized on retry and contained 5,000,000,000 smallest units of tNIGHT. No additional faucet request was made. The deployment workflow registered DUST, then actually deployed the test token and vault to Midnight Preview. Details and transaction IDs: artifacts/deployment.preview.json and artifacts/preview-verification.json.

Commands: `ALLOW_PUBLIC_TEST_DEPLOY=yes MIDNIGHT_FUND_TIMEOUT_MS=3600000 npm run client:preview -- deploy`, `npm run client:preview -- status`, `npm run client:preview -- mint 10000`, `npm run client:preview -- fund`, and a final `npm run client:preview -- status`. All returned successfully. The indexed final ledger reported principal 0, reserve 10000, allocations/credits 0, simulated clock 0 and simulated APY 1000 basis points. Mint and reserve funding were real contract calls; this is one backed reward unit. The existing frontend and gateway still target local devnet. No Preview deposit/claim/redeem or AI end-to-end flow was performed.

## Preview terminal and wallet connection

Gateway and terminal now have separate Preview processes, database, credit directory and ports (8788/8791). Startup compares gateway network and vault against the Preview deployment manifest. The browser enumerates v4 injected Midnight wallet connectors, supports multiple-wallet selection, requests Preview, checks connection status and address network, and clears its own session on disconnect. Wallet addresses remain in the browser. The terminal explicitly reports that wallet connection does not create credits or authorize deposits.

Verified 2026-11-22: Preview gateway health returned network preview and the deployed vault address; Preview terminal loaded with zero available Preview credits. The in-app browser had no compatible wallet extension, and displayed the expected install/unlock guidance; no real wallet connection was claimed. Automated wallet tests use a simulated connector to check discovery, network, connected status and wrong-network rejection. Full unit/typecheck results follow in the task response. The browser wallet is not yet integrated into deposit/claim or note custody. No Preview AI request was executed.

## Yield-backed prompt-capacity meter

Replaced numeric credit counts and the visible note selector with a circular ring/diamond allowance indicator next to Send. The sidebar now describes prompt capacity, and the remaining status text uses allowance language without a numeric request count. The meter uses the unused share of the session's funded, claimed yield entitlements; it does not include unclaimed rewards or pretend to read the connected wallet's yield. Fixed one-unit entitlement sizing makes this share equivalent to the share of funded allocations still available. A zero-note Preview session shows an empty meter and remains unable to submit. Tooltip and accessible meter text explain the basis.

TypeScript PASS; focused capacity and terminal tests: 4 PASS. Checked the Preview page in the browser and both local/Preview capacity modules returned HTTP 200. Local and Preview terminal services were restarted only after verifying they had no in-flight requests. Existing credit/nullifier accounting is unchanged. Connecting wallet deposits/claims remains separate outstanding work.

## Private Vault page and project-wide review

Added Private vault navigation, private principal and simulated-yield metrics, supported test-asset mint, exact-lot deposit, funded allowance claim, whole-lot withdrawal, encrypted note backup/restore, pending-operation reconciliation and transaction history. Browser secrets/journals are AES-GCM encrypted with a password-derived key and account/network/contract authenticated scope. The loopback app and local proof server process openings; extension keys stay in the wallet. This is an explicit trusted-local-client architecture, not browser-only proving.

The wallet bridge asks the connected extension to balance and submit serialized Ledger 9 transactions and waits for actual indexed confirmation. Deterministic caller-generated claim rotation allows a lost response to be reconstructed from the encrypted journal. Private operation IDs are not listed in public session state. The independent allowance secret is redeemed by the separate relay and the gateway accepts only the finalized receipt. Browser inference retry state is encrypted and bound to its original prompt.

Actual checks: TypeScript PASS. The first full new unit suite had 39 PASS; a subsequent focused group including the new Vault HTTP transport case had 10 PASS. The final consolidated suite result is captured below. The real local serialized-wallet test first passed deposit/claim/withdrawal and then passed an expanded run (233 seconds) with redemption, actual finalized receipt validation, cached replay and an explicitly offline mock inference. Public evidence: artifacts/browser-vault-local.json. Principal returned, four automated wallet balance approvals, a declined approval did not submit, and public-secret inspection passed. No private notes/seeds are in that evidence.

The Preview page loaded and read its deployed vault's actual lot/rate/clock/reserve. The in-app browser has no wallet extension; a real installed-wallet Preview approval walkthrough has not been performed. No new public contracts were deployed by this UI work, and no additional faucet request was made. The supported Preview deployment and one funded reserve unit remain the existing ones.

User clarification: engineering, QA/reliability, product/vision, UX/design, communication and business viability are project-wide criteria, not only Vault requirements. docs/PROJECT_SCORECARD.md records evidence, gaps, completion gates, an honest demo story and cost/buyer hypotheses. The priority is the complete Preview user journey before extra features; simulated rewards and sponsor-funded inference do not prove real-yield economics or business viability.

Final consolidated result: `npm test` 40 PASS across 11 files; TypeScript PASS; all three new/changed browser modules passed Node syntax checks. The expanded real local-node test passed in 233 seconds with actual node/proof-server verification and automated connector-style approvals. Preview read-only allowance refresh correctly returned nonexistent/not-spent for a fabricated test secret; it did not create an allowance or send a transaction. The Preview and local terminal processes are running with the current Vault service. The updated Preview Vault unlock screen was visually inspected, and wallet guidance is shown globally so failures remain visible on the Vault page. Screenshot: artifacts/private-vault-page.png.

Final follow-up: a cross-tab writer lock and closed-store write guard were added after a data-loss review. The consolidated suite now has 41 PASS across 11 files; TypeScript and browser syntax checks pass. The new guard prevents ordinary app tabs from overwriting the same private store and blocks stale writes after locking. No protocol or Compact changes required another deployment. A project-wide README rewrite now distinguishes verified local evidence, Preview deployment evidence, the manual extension walkthrough gate and unvalidated economic hypotheses.

The final visual check also caught an accidental stylesheet overwrite. It was repaired without touching private data or contracts. The stylesheet now has readable source, returns the correct CSS MIME/content, and the AI/Vault views were visually checked again. The saved Vault screenshot reflects the repaired styling. No new dependency was needed; key decoding uses the pinned wallet SDK's public exports.

## 2026-11-22 — completion pass: private-note recovery and demo preparation

Current scope is the integrated Vault and AI Workspace; the backend-only/frontend-deferred statements above are historical. Fresh baseline: 41 offline tests and type checking passed. Fixed two note-loss risks without changing contracts or deployment artifacts: an overlapping encrypted save now fails before writing, snapshots isolate the saved data from caller mutation, and importing a backup over populated note/history/pending/request state is refused. Backup recovery remains available through an empty separate browser profile. Added two regressions; the consolidated suite now passes 43 tests. Node syntax checking and TypeScript pass.

Added docs/DEMO.md with the exact compiler-compatible coding demo, rejection/reload/restore/retry acceptance checklist and evidence boundaries. Added dependency-review.json: 26 moderate, zero high/critical audit findings; automatic suggested Midnight SDK downgrades were not applied. Dependency migration remains open.

A standalone real local model latency sample is recorded in artifacts/inference-benchmark.json. It took 11.09 seconds cold, but its general Midnight answer failed factual review. This is latency/quality evidence, not a successful paid-flow claim or unit-economics validation. The demo uses the existing version-pinned Compact task with skill/compiler validation instead.

The browser origin approval gate declined access, so no new visual or installed-wallet Preview walkthrough is claimed. Existing local/Preview services and private notes were preserved; no chain reset, mainnet action, additional Preview faucet request or source publication was performed. The actual local SDK wallet/proof integration rerun is recorded below when it settles.

Real model follow-up: the existing skill-guided OpenCode → local Ollama → Compact compiler path returned a valid PrivateBudget in 10.305 seconds. `npm run check:generated -- artifacts/compact-model-recheck.txt artifacts/compact-recheck` compiled real proving keys and passed all 12 independent behavioral/privacy checks. Evidence: artifacts/compact-model-recheck.json and artifacts/compact-recheck/verification.json. This standalone check did not redeem an allowance or deploy a new generated contract.

Fresh real local integration: `npm run test:wallet` PASS, 241.24 seconds test / 242.83 seconds total. Four actual SDK wallet balance approvals, mint/deposit/claim/anonymous redemption/withdrawal proved and finalized, principal returned, same receipt replay did not pay again, finalized-receipt gateway cache passed, declined approval did not submit, and public-secret inspection passed. Inference in this integration is explicitly OFFLINE MOCK. artifacts/browser-vault-local.json records fresh transaction evidence. No installed extension/Preview acceptance is inferred from this result.

## 2026-11-22 — Mera passkey integration

Implemented the checklist in meraintegration.md: pinned Mera 0.2.0, same-origin browser bundle, scope-bound encrypted password wrapper, optional enrollment/passkey unlock, backup/restore and recovery handling. Existing note/journal encryption and Midnight approvals are preserved. Six real-Mera/simulated-authenticator regressions cover successful unlock/recovery and negative cases. Consolidated tests: 49 PASS across 12 files; type/syntax/build PASS. Node baseline is now 24. Both idle terminal services restarted on Node 24.18.0, and localhost local/Preview sessions responded. Real wallet/proof integration on Node 24 PASS in 232.12 seconds; principal returned and replay/declined-approval checks passed. No contracts changed or public deployment occurred. Physical Brave/PRF hardware enrollment remains unverified because desktop controls are unavailable. Evidence: artifacts/mera-integration.json and fresh artifacts/browser-vault-local.json.

## 2026-11-22 — UX improvements 1, 2, 3 and 6

Implemented the requested guided setup, passkey-first returning unlock, real operation stages with elapsed time and adapter-aware AI interface. Setup uses encrypted local state and confirmed history, asks for explicit backup acknowledgment and offers test assets before a first deposit. Pending operations route to reconciliation rather than replacement. Ready allowance hides the setup guide. Passkey metadata is inspected locally without a ceremony, with password recovery kept accessible.

The gateway publishes its actual adapter in health; terminals expose that value to the UI. Compiler mode offers the exact independently tested Compact demo task, generated into a same-origin module at build time. Text and mock adapters display their own capabilities. Wallet bridge, relay and real CLI events drive stage labels; the AI response stage includes gateway verification, generation and compiler repair without pretending to expose uninstrumented internal steps.

Verification: 55 offline tests across 13 files PASS; final setup helper changes passed the four focused experience tests. TypeScript, JavaScript syntax and HTML/control-ID consistency PASS. Actual local SDK wallet/proof integration PASS in 237.44 seconds, with principal returned, anonymous redemption, cached retry and declined approval rejection. This integration's inference is OFFLINE MOCK; real model/compiler evidence remains separate. Both idle gateway/terminal pairs restarted on Node 24 after confirming no active UI operations or pending gateway executions; local and Preview session metadata both report opencode-compact. No contracts changed or public deployments occurred. Visual/keyboard/mobile and physical Brave passkey acceptance remain unverified because browser controls are unavailable. Evidence: artifacts/ux-improvements.json and fresh artifacts/browser-vault-local.json.

## 2026-11-24 — project-wide completion criteria reconciled

Reviewed the live checkout rather than treating the old yield plan as current. Rewrote PROJECT_SCORECARD.md around the implemented prepaid/refundable-credit product across all six requested criteria. Preserved explicit legacy-vault boundaries and distinguished recorded local two-chain evidence from unverified public prepaid deployment. Added the current-scope clarification to IMPLEMENTATION_PLAN.md.

Fresh checks: `npm run typecheck` PASS; `npm test` 64 PASS across 17 files (18.43 seconds); `npm run test:treasury` 11 PASS, including 128 fuzz cases. Browser bundle built as the test prerequisite. No contracts, private notes, deployments or running services changed in this documentation alignment. The real two-chain/model evidence was inspected, not rerun; physical wallet/public prepaid acceptance and commercial validation remain open rather than being marked complete.


## 2026-11-24 — deployment preparation, recovery and acceptance

User explicitly selected “Prepare deployment; submission pending.” Implemented a Sepolia/Preview-only deployment command and read-only preflight, retaining signed transaction bytes before broadcast and refusing existing deployment/recovery state. Private provider RPC URLs stay out of the public manifest. Preview issuer files and relay journals are now isolated from local state. Preflight reports missing SEPOLIA_RPC_URL/EVM_RELAY_PRIVATE_KEY; zero public transactions were submitted and no faucet requested.

A resumed existing local demo initially failed before mutation because Anvil had pruned historical execution state. The demo now preserves the pre-payment balance in its private recovery file; old files can reconstruct the original balance from retained ERC20 Transfer logs. The resumed completed demo then PASSed finalized-payment authorization replay, existing paid-receipt cache, seed recovery, refund replay and zero liabilities. Original full proof/model evidence remains artifacts/prepaid-e2e.json; the resumed result is separately recorded in artifacts/prepaid-resume.json and does not claim fresh inference or spending proofs.

Fresh Node 24.18.0 checks: TypeScript PASS, npm test 66 PASS across 18 files, treasury 11 PASS including 128 fuzz cases, browser/benchmark syntax PASS. Six real direct local-model requests recorded latency and coarse gross first-GPU energy. The small model failed exact-output adherence in all three trials; the 7B coder passed all three. This is a short-task benchmark, not a full cost/profit or paid-gateway claim.

Browser acceptance checked desktop layout, password-to-unlock keyboard focus, missing-wallet guidance and mobile 390px overflow/touch targets. Fixed stale prepaid yield accessibility labels and increased mobile controls to 44px minimum targets. Saved artifacts/prepaid-acceptance.png. Physical wallet extensions/authenticators are absent from the connected browser, so their acceptance remains explicitly unverified.

Updated README, current-product DEMO, PUBLIC_PREPAID_DEPLOYMENT, BUSINESS_VALIDATION, scorecard and test matrix. Business worksheet and measured limits are concrete; no customer responses, traction or viability were invented. Evidence summary: artifacts/completion-acceptance.json. Contracts/proving keys were not changed or recompiled over live instances; existing notes and deployments remain intact.


## 2026-11-24 — fresh proof-backed prepaid cycle completed

Changed the local rehearsal to support another run on an idle existing instance without resetting or redeploying: capture starting consumed/refunded counters in private recovery state, require zero unrelated pending/outstanding/refund liabilities and uncollected revenue, then assert exact per-run counter increments. TypeScript passed. The existing idle terminal was paused during the rehearsal to avoid competing settlement workers and restarted afterward on Node 24.18.0.

Actual fresh run: `PREPAID_EVIDENCE_FILE=artifacts/prepaid-e2e.fresh.json npm run demo:prepaid` PASS. Five new credits purchased; four new automated SDK wallet-approved Midnight transactions (claim, two spends, refund); two first model calls uncached and identical retries cached; original seed recovered the three-credit remainder; unused credits refunded; source liabilities, treasury balance and outstanding credits all zero. Starting aggregate counters were 2 consumed / 3 refunded; final counters advanced by exactly 2 / 3. Existing deployment and original proof/model evidence were preserved.

Model output quality remains separate: the small model returned READY; the text coder misinterpreted BigInt literals and produced an incorrect expression. The Compact-checked route remains a separate compiler-validated capability, not a correctness promise for text models.

Post-restart HTTP acceptance: prepaid terminal/status 200 with pending/outstanding units zero; gateway health ok on undeployed/local. Public preflight still reports missing SEPOLIA_RPC_URL/EVM_RELAY_PRIVATE_KEY and zero submissions. Public deployment remains unperformed, consistent with the user's earlier prepare-only choice. Physical wallet/passkey approvals and customer interviews cannot be completed through the available browser, which has no extensions/authenticator. No real funds, new faucet requests, customer outreach or production deployment occurred.


## 2026-11-24 — public repository and Vercel deployment

Created public https://github.com/wolf1276/shadowcompute and published the initial implementation in five focused commits: toolchain, protocol, backend, UI and documentation/evidence. Followed with separate companion, Vercel build, CI and startup fixes; no single all-files commit. Actual seeds, provider/relay credentials, private states, databases, proving keys, model weights and Vercel credentials remain excluded. Gitleaks history scan is clean with narrow documented public-field/storage-namespace exceptions. Exact configured secret comparison found no private wallet/relay/password values in tracked files; the disposable local-test password is an explicit fixture, not a Preview credential.

Production https://shadowcompute.vercel.app is READY and HTTP 200, with GitHub main connected for automatic deployments. Isolated web build installs six public dependency packages and publishes only 16 static assets; no Midnight/GPU services run in Vercel Functions. Implemented exact-HTTPS-origin CORS, manual loopback pairing, sessionStorage-only pairing state, no remote code discovery and bounded network errors. Existing local clients remain supported. The chosen architecture keeps this computer as the demo companion.

Verification: 69 root tests across 19 files PASS, TypeScript PASS, deployment allowlist/module/CSP test PASS and GitHub web CI PASS. Actual companion API returned 200 with the production Origin and valid code. Production pairing screen was visually inspected and saved as artifacts/vercel-live.png. Browser cross-origin loopback fetch timed out; no successful browser pairing, installed extension or authenticator acceptance is claimed. Production remains explicit about requiring a local companion, and the new prepaid public-chain deployment remains pending.

At the user's request, stopped native Ollama, Anvil, all project gateways/terminals, and Docker node/indexer/proof services after confirming no active operations or pending inference. Used compose stop, preserving containers rather than deleting local-chain layers; changed env:down to stop as a safeguard. Anvil snapshot was saved. Verified the project ports were closed and no project GPU model remained. User desktop apps were not killed. Model weights, private notes, chain containers and journals remain for a later demo; services must not be restarted until the user requests the demo. Evidence: artifacts/vercel-deployment.json.
