# Business validation and measured service limits

## Current offer and buyer hypotheses

One prepaid balance across configured AI models, private Midnight spending and a refund for unused credits. The first potential buyers are privacy-conscious developers and sponsored developer programs. These are hypotheses: no interviews, traction, paid customers or validated willingness to pay are claimed.

Compare against conventional AI aggregators and anonymous prepaid vouchers. Test whether hiding a funding position justifies two wallets, note backups and a trusted bridge operator. Do not promise hidden prompts, trustless bridging, native USDC on Midnight or investment returns.

## Actual measurement

Run `node scripts/benchmark-inference.mjs`. The artifact `artifacts/inference-cost-benchmark.json` records six direct local Ollama requests, separate from proof/relay/gateway authorization. For this short arithmetic task, the 0.5B model took 2.164 seconds initially and 0.159–0.166 seconds warm; the 7B coder took 8.755 seconds initially and 0.118–0.126 seconds warm. Those timings are not representative of long coding requests or end-to-end credit latency.

The 7B coder returned the exact required answer in all three trials. The smaller model returned correct arithmetic with extra prose in all three trials, failing the exact-output requirement. Model availability and transport are not quality guarantees; compiler-checked coding remains separately bounded and tested.

Gross first-GPU board energy samples were approximately 26/5/5 joules for the small model and 159/3/3 joules for the coder. Short-request sampling is coarse. These include idle/other GPU use and omit the rest of the machine, hardware depreciation, proving, settlement, support and retries. Do not turn these figures into a total-cost or profit claim.

## Commercial unit model

For each completed request, measure:

`service cost = provider or full hardware allocation + proving/relay/settlement allocation + expected retry/refund/support cost`

`contribution = realized consumed-credit revenue − service cost`

Unused prepaid funds remain a full refund liability, not revenue. Test tokens have no money value; the current local inference is operator-funded. Track cold/warm latency, input/output sizes, model quality, failed drafts and retry counts. Record the electricity tariff, measured whole-system power, hardware amortization and expected utilization before pricing self-hosted inference. Do not subsidize consumption from refundable reserves.

## Interview worksheet

Use five or more potential users and at least two program/sponsor buyers before treating the hypothesis as validated. Do not contact anyone without an explicit instruction.

| Record for each interview | Question |
|---|---|
| User segment and current workflow | Which models do you use and how do you pay today? |
| Concrete privacy pain | What did public funding/account linkage prevent you from doing? |
| Alternative and switching cost | Would an anonymous voucher solve this with less complexity? |
| Product friction | Would you connect two wallets and manage a recovery backup? |
| Pricing/refund expectation | What would you pay per useful completed task, and when would you expect a refund? |
| Sponsor decision | Who owns budget, integration approval and operational liability? |
| Evidence | Record a consented quote/observed behavior, date and follow-up; do not invent answers. |

Deliverable remains a working technical prototype with measured limits. A positive business conclusion requires actual customer evidence and a full cost model; code and deployment cannot substitute for that validation.
