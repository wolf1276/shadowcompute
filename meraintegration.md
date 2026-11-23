# Mera passkey integration

## Goal

Unlock ShadowCompute's existing encrypted private notes using a Mera passkey. Midnight wallet approvals remain required for chain transactions.

## Design

Preserve the current scope-bound AES-GCM note store and password recovery. After a password unlock, Mera encrypts the vault unlock secret using a new PRF-capable passkey. A later passkey assertion decrypts that secret locally and opens the same note store. Encrypt wallet/network/contract scope alongside the secret and reject mismatches. Never send the unlock secret, PRF output or passkey wrapper to the backend. Passkey setup is optional; unsupported/cancelled ceremonies leave the password vault intact.

Store the encrypted Mera wrapper inside the existing scoped note envelope. Include it in encrypted note backups, restore it only after successful note decryption, and keep populated-vault overwrite protection. Existing notes, pending journals and wallet custody must remain unchanged. Password unlock stays available for recovery. Passkeys do not reconstruct lost note files.

The wrapped unlock secret is the existing recovery password. This preserves the established PBKDF2/AES-GCM format and avoids a risky data-key migration. Password recovery remains an alternative unlock route; passkey enrollment does not remove it.

## Checklist

- [x] Inspect Mera's local API and ShadowCompute's note storage, callers, backup, locking and transport.
- [x] Pin and bundle the real Mera SDK for same-origin browser loading.
- [x] Add scope-bound passkey enrollment/unlock helpers with metadata validation and secret cleanup.
- [x] Add optional passkey enrollment after password unlock, passkey login and backup/restore support.
- [x] Test successful enrollment/unlock, cancellation/unsupported PRF, wrong scope, damaged data and backup recovery without exposing secrets.
- [x] Run unit/type/syntax/build checks and document exact results.
- [ ] Verify real Brave/authenticator enrollment and unlock if browser controls are available; otherwise record this as an open manual acceptance gate.

## Limits

This is local encrypted-store unlocking, not server login or a Midnight signing wallet. Scope includes network, vault and connected wallet. Use a stable localhost hostname for development and a stable HTTPS domain for deployment; passkeys are bound to their relying party. Do not claim hardware compatibility from mocked authenticator tests. Retain the recovery password and current encrypted backup.

## Implementation and verified results

- Pinned `@category-labs/mera` 0.2.0 and a reproducible same-origin browser bundle; Mera's MIT notice is embedded and retained in LICENSE.mera-MIT.
- Added **Enable passkey unlock** after password unlock and **Unlock with passkey** on returning visits. The recovery password remains available. Unsupported/cancelled prompts never silently create another vault.
- The authenticated note scope stays bound to the connected wallet, network and contract. The encrypted wrapper is validated on use and included in backups. A closed store cannot save a completed enrollment; storage-write failure preserves the original vault.
- Build, TypeScript and JavaScript syntax checks pass. Consolidated suite: **49 tests pass across 12 files** on Node 24.18.0. Tests use actual Mera encryption and a simulated authenticator; they do not establish physical hardware support. Same-origin asset transport and license notice are checked.
- Updated Node runtime requirement to 24, matching Mera's declared support. Both idle terminal services were restarted on Node 24; local and Preview sessions respond on localhost:8790 and localhost:8791. Existing gateways/private stores/deployments were preserved.

The real local SDK wallet/proof integration also passed on Node 24.18.0: 230.402 seconds test / 232.12 seconds total. Mint, deposit, claim, anonymous redemption and withdrawal finalized; principal returned, cached retry and declined approval checks passed. Its inference is explicitly OFFLINE MOCK. Fresh evidence: `artifacts/browser-vault-local.json`. This validates the runtime migration and chain flow, not physical passkey hardware.

## Manual Brave acceptance gate

Desktop/Brave controls are unavailable in this chat. No physical passkey has been enrolled or used. In Brave, open http://localhost:8791, connect the Preview wallet, unlock with the recovery password, settle any pending action, and select **Enable passkey unlock**. Complete the authenticator prompt and download a new encrypted backup. Lock the vault, choose **Unlock with passkey**, complete user verification, and verify the same position/history appears. Cancel a request to confirm password recovery remains available.

If the existing notes are stored at 127.0.0.1, back them up there before switching to localhost, then restore with the original wallet and recovery password. Do not clear the old site's data. A physical PRF-capable authenticator/OS must pass this gate before browser compatibility is claimed.
