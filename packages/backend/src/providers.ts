import { mkdirSync, chmodSync } from 'node:fs';
// This file is part of example-private-tip-jar.
// Copyright (C) Midnight Foundation
// SPDX-License-Identifier: Apache-2.0
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Returns the providers in an object which can be created for each user's individual tests
import {
  createLedger9MidnightProvider,
  createLedger9WalletProvider,
  type MidnightProviders,
  type ContractStateRead,
} from '@midnight-ntwrk/midnight-js-types';
import { ContractState } from '@midnight-ntwrk/midnight-js-protocol/v9/compact-runtime';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { type MidnightWalletProvider } from './wallet.js';
import { type NetworkConfig } from './config.js';


// The set of callable circuit ids, derived from the compiled contract's
// generated types. This tracks whatever circuits your .compact exports, so you
// never have to edit this file when you add, remove, or rename a circuit.
export type ShadowCircuits = string;

export type ShadowProviders = MidnightProviders<any>;
export type WalletConnection=Pick<MidnightWalletProvider,'getCoinPublicKey'|'getEncryptionPublicKey'|'balanceTx'|'submitTx'>;

// How long a built transaction stays valid, in seconds (Midnight.js 5's
// `config.ttlSeconds`).
const TX_TTL_SECONDS = Number(process.env['MIDNIGHT_TX_TTL_SECONDS'] ?? 3600);

// Build one provider set per (wallet, contract). This example has two
// contracts (the tip jar and a demo token), so zkConfigPath picks which
// contract/managed/<contract>/ directory the keys come from. The random suffix
// keeps each set's private-state store separate: several sets are built in the
// same millisecond, so a timestamp alone would collide.
export function buildProviders(
  wallet: WalletConnection,
  zkConfigPath: string,
  config: NetworkConfig,
): ShadowProviders {
  mkdirSync('.private-states', {recursive:true, mode:0o700});
  chmodSync('.private-states', 0o700);
  const zkConfigProvider = new NodeZkConfigProvider<ShadowCircuits>(zkConfigPath);
  return {
    privateStateProvider: levelPrivateStateProvider({
      midnightDbName: `.private-states/midnight-${config.networkId}`,
      privateStateStoreName: `shadowcompute-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      // this password has requirements (capital/special chars >= 3)
      privateStoragePasswordProvider: () => {
        const password=process.env.PRIVATE_STATE_PASSWORD;
        if(!password)throw new Error('PRIVATE_STATE_PASSWORD is required');
        return password;
      },
      accountId: wallet.getCoinPublicKey(),
    }),
    publicDataProvider: indexerPublicDataProvider(
      config.indexer,
      config.indexerWS,
    ),
    zkConfigProvider,
    proofProvider: httpClientProofProvider({url: config.proofServer, zkConfigProvider}),
    // Midnight.js 5 providers are tagged with the ledger eras they serve. The
    // wallet is ledger 9 only; these lift it into the tagged interfaces.
    walletProvider: createLedger9WalletProvider(wallet),
    midnightProvider: createLedger9MidnightProvider((tx) => wallet.submitTx(tx)),
    config: { networkId: config.networkId, ttlSeconds: TX_TTL_SECONDS },
  };
}

/**
 * The public ledger state of a contract read with queryContractState, for the
 * compiled `ledger()` to decode. Midnight.js 5 hands back the serialized state
 * tagged with the ledger era that wrote it; every contract here is deployed on
 * ledger 9, so only a ledger 9 decoder is given.
 */
export function ledgerState(read: ContractStateRead | null) {
  if (read === null) throw new Error('contract state not found');
  if (read.contractState.era !== 'v9') throw new Error('expected a ledger 9 contract state');
  return read.contractState.deserialize({ v9: ContractState }).data;
}
