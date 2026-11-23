# Upstream reference

Official https://github.com/midnightntwrk/midnight-examples commit `7c3b43fcfe35fa65e4e752460819e8ba1b2aba6b` (retrieved 2026-11-21). Wallet provider, network configuration, coin helpers, simulator harness, demo faucet and compose configuration are adapted from its private-tip-jar and hello-world examples under Apache-2.0; see LICENSE.midnight-examples and retained source headers. Toolchain pins copied from toolchain.json.

Official references: https://docs.midnight.network/ ; https://docs.midnight.network/tutorials/private-tip-jar ; https://docs.midnight.network/guides/build-a-private-smart-contract (Ledger 8 warning acknowledged).

## UI design reference

Corral: https://github.com/arko05roy/corral, inspected commit cf1b30e79c4ef2cfa95a8d955b62f6fef41102ae. No license file found in the cloned tree. The local terminal recreates the requested visual layout with original source; no Corral source, assets, Electron backend or package dependencies were vendored.

## Mera passkey SDK

`@category-labs/mera` 0.2.0 is pinned from the npm registry (https://github.com/category-labs/mera). Used under MIT; see LICENSE.mera-MIT. The browser build embeds the full Mera MIT notice and retains dependency license notices. Only the secret-vault/passkey functions are bundled; no Mera signing wallet or chain-account derivation is used.

## Prepaid treasury and EVM integration

OpenZeppelin Contracts 5.6.1 (MIT) supplies ERC20 interfaces, SafeERC20 and ReentrancyGuard; sources remain in the pinned npm dependency. viem 2.58.4 (MIT) supplies typed EVM RPC, ABI encoding/decoding and signing. The source test treasury/MockStable are local test contracts; they are not Circle-issued USDC or an Aave deployment.
