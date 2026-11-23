# Implementation plan

1. Pin Ledger 9 tools, compile smoke contract, start Docker devnet/proof server, deploy and ping with Midnight.js. Separate real-network and simulator suites.
2. Implement fixed-lot shielded custody, private Merkle membership/ownership and nullifiers; test multi-user deposits, unauthorized/double withdrawals and conservation.
3. Add sealed configurable APY, bounded authenticated simulated clock, funded unit reserve, note rotation, private credit membership/redemption and expiry receipts. Test exhausted reserves, checkpoint/carry arithmetic and domain separation.
4. Implement receipt verification from indexed on-chain state, durable exactly-once request charging, retries/reconciliation, mock adapter and environment-configured real provider adapter. Test failures/replays/concurrency/expiry.
5. Integrate headless user/relay/sponsor clients and complete backend-only mint → fund → deposit → advance simulation → claim → redeem → inference → withdraw flow; record actual evidence and limitations. No frontend.

6. Local AI extension: configure GPU Ollama/OpenCode, inject the current Compact skill, compile model drafts with bounded diagnostic repair, independently check generated behavior and real proving keys, deploy and submit a real private-owner call. Preserve failed drafts and reuse paid receipts rather than redeeming another credit. Public-network funding is unnecessary for this demo and is stopped.

7. New user-requested scope: recreate Corral's terminal layout with original source, connect the existing credit client to a loopback browser console, test local HTTP security/recovery and complete real browser → redemption proof → local model → compiler-checked response. Full vault dashboard, browser-wallet integration and Electron shell/git functionality remain outside this terminal slice.

8. Private Vault UI: encrypted browser notes and backups, local proof construction with extension-approved balance/submission, confirmed mint/deposit/claim/withdraw, pending journal recovery and anonymous relay redemption into inference. Verify the serialized wallet boundary with actual proofs on the local node before a manual Preview extension walkthrough.
9. Apply the project-wide six-pillar scorecard to protocol, infrastructure, frontend, demo, pitch and business assumptions. Prioritize measured evidence and the complete Preview journey over additional features.

## Current scope supersedes the historical sequence above

The prepaid product in `creditsintegration.md` and README is current; the simulated-yield vault is legacy. Apply `PROJECT_SCORECARD.md` to the entire prepaid stack. Local implementation and accounting/model integration have recorded evidence. Public Sepolia/Preview deployment, installed-wallet/passkey acceptance and business validation remain separate open gates.
