# AgentPay Client & Devnet Demo

This directory contains the first product-facing client for the AgentPay MVP.

It uses the Anchor-generated IDL from `anchor build` and calls the Guardrail program on Solana Devnet.

## Flow

```text
Demo owner
   │
   ├─ create policy
   ├─ fund vault
   │
   ▼
Agent authority
   │
   └─ request payment
          │
          ▼
      Guardrail
       ├─ APPROVE → SOL transfer
       └─ REJECT  → policy violation
```

## Prerequisites

- Node.js 20.18+
- Anchor CLI
- Solana CLI
- a funded Devnet wallet

Anchor generates the program IDL under `target/idl`; this repository config copies the generated IDL and TypeScript types into `client/src/idl` during `anchor build`. citeturn0search0turn0search3

## Run

From the repository root:

```bash
anchor build
cd client
npm install
npm run demo:devnet
```

The demo reads the wallet from `ANCHOR_WALLET`, falling back to `~/.config/solana/id.json`.

Override the RPC endpoint if required:

```bash
AGENTPAY_RPC_URL=https://api.devnet.solana.com npm run demo:devnet
```

The demo intentionally creates fresh owner, agent-authority, and recipient keypairs on every run. The owner is funded by the configured wallet, so the deterministic Guardrail PDA does not collide with previous demo runs.

## What the demo proves

1. AgentPay creates an on-chain policy.
2. The vault is funded.
3. An authorized agent executes an allowed payment.
4. A payment above the per-transaction limit is rejected by Guardrail.
5. Successful transactions can be opened directly in Solana Explorer.

Never put a private key, seed phrase, or `.env` secret in the repository.
