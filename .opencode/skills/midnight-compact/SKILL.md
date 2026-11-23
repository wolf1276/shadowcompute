---
name: midnight-compact
description: Author and repair real Midnight Compact 0.28 contracts using private witnesses, explicit disclosure and checked accounting. Applies to Compact code; answer unrelated questions normally.
---

# Real Compact for ShadowCompute

Use language 0.28, compiler 0.36.1 and Ledger 9. The project's toolchain.json pins Midnight.js 5.0.1. Older Ledger 8 tutorials have different pins. This skill improves grounding; compilation and behavior tests still decide correctness.

## Grammar reference

- `pragma language_version 0.28;`
- `import CompactStandardLibrary;`
- Public state: `export ledger spent: Uint<64>;`
- Constructor-only state: `export sealed ledger owner: Bytes<32>;`
- Private witness: `witness secretKey(): Bytes<32>;` ends with a semicolon. Its implementation is off-chain TypeScript, not a Compact function body.
- Constructor header: `constructor(initial: Boolean) {`
- Public circuit header: `export circuit setEnabled(value: Boolean): [] {`
- Pure helper header: `export pure circuit ownerKey(sk: Bytes<32>): Bytes<32> {`
- A circuit header goes directly from the return type to `{`. Conditions belong inside the body, as `assert(condition, "message");` statements.
- Ledger reads are direct: `const snapshot = spent;`. Ledger writes are direct assignments: `spent = disclose(value);`.
- Constructor arguments are private too: publish an intended public value with `cap = disclose(limit);`.
- Preserve the exact witness, helper and entrypoint names requested by the caller. Names below illustrate syntax; adapt the logic to the task.

## Valid complete example: private-owner Boolean control

```compact
pragma language_version 0.28;
import CompactStandardLibrary;
export sealed ledger owner: Bytes<32>;
export ledger enabled: Boolean;
witness secretKey(): Bytes<32>;
constructor(initial: Boolean) {
  owner = disclose(ownerKey(secretKey()));
  enabled = disclose(initial);
}
export pure circuit ownerKey(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([pad(32, "example:owner:v1"), sk]);
}
export circuit setEnabled(value: Boolean): [] {
  assert(ownerKey(secretKey()) == owner, "Not owner");
  enabled = disclose(value);
}
```

## Counter primitive example

`Counter` is a ledger ADT, not a Uint. It starts at zero without a constructor. Increment it with `.increment(1)`, never direct assignment, arithmetic or a witness:

```compact
pragma language_version 0.28;
import CompactStandardLibrary;
export ledger count: Counter;
export circuit increment(): [] {
  count.increment(1);
}
```

## Arithmetic and privacy

Every assert requires BOTH parentheses and a message: `assert(amount > 0, "Amount must be positive");`. Never use `assert amount > 0;` or omit the message.

For a capped spending circuit, retain these independent checks and the parenthesized checked addition (adapt only the field names):

```compact
assert(ownerKey(secretKey()) == owner, "Not owner");
assert(amount > 0, "Amount must be positive");
assert(amount <= cap - spent, "Over budget");
spent = (spent + disclose(amount)) as Uint<64>;
```

Use the caller's domain label and fresh high-entropy secrets. Every ledger field is public; disclose acknowledges publication and does not encrypt. Owner authentication must compare the witness-derived hash INSIDE the circuit. Never publish the witness or a secret directly. Low-entropy private values need a fresh salted commitment, not a plain amount hash. Multi-note protocols must constrain membership leaf/root and reject spent, instance-bound nullifiers.

For a Uint<64> capped amount, maintain spent <= cap. Separately assert the delta is positive and delta <= cap - spent BEFORE adding it. Only then assign `(spent + disclose(delta)) as Uint<64>`. Uint addition widens its range; casting an unchecked sum can wrap. Preserve checkpoints/remainders and funded allocations when yield accounting is requested. Contract-held shielded coin values may be public; consult the supplied current vault source for actual token APIs rather than inventing them.

## Authoring and validation

Return actual Compact in one fenced `compact` block when asked for source. Follow the exact requested interface and retain every authorization check. A text-only model cannot compile or deploy; do not claim that it did. The operator compiles with `compact compile +0.36.1 SOURCE OUTPUT`, checks owner/attacker, zero, exact cap, over-cap, overflow, replay where relevant and public-ledger secrecy, then verifies real proofs on a local node. If diagnostics are supplied, repair the underlying invalid pattern and test again. Never add a reset or alternate mutator that bypasses the requested policy.

Sources: project toolchain.json and packages/contracts/contract/shadow-vault.compact; https://github.com/midnightntwrk/midnight-examples pinned by THIRD_PARTY.md; https://docs.midnight.network/tutorials/private-tip-jar . This skill grants no tool permissions, deployment authority or permission to reveal secrets.
