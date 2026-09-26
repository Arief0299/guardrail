# AgentPay — Guardrail

Policy-controlled payment infrastructure for autonomous agents on Solana.

**Guardrail** is the on-chain security layer of **AgentPay**. It turns an agent's payment request into a deterministic policy decision: approve the payment only when authorization, recipient, spending limits, expiry, pause state, and vault-balance checks all pass.

> **Current status:** hackathon MVP. The current implementation supports SOL payments on Solana and is designed for local development plus Devnet deployment.

## Why AgentPay

Autonomous agents need the ability to pay, but giving an agent unrestricted wallet authority creates unnecessary risk.

AgentPay separates **agent execution** from **payment policy**:

```text
Owner
  │
  ├─ configure policy
  ├─ set agent authority
  ├─ set recipient
  └─ fund vault
          │
          ▼
     AgentPay / Agent
          │
          │ payment request
          ▼
   ┌─────────────────────┐
   │ Guardrail Program   │
   │                     │
   │ authorization       │
   │ recipient allowlist │
   │ per-tx limit        │
   │ daily limit         │
   │ expiry              │
   │ pause state          │
   │ vault + rent check  │
   └──────────┬──────────┘
              │
        ┌─────┴─────┐
        ▼           ▼
      APPROVE      REJECT
        │
        ▼
   SOL → recipient
```

## Guardrail security model

The owner creates and controls an agent policy. The configured agent authority may execute payments only when every on-chain policy check succeeds.

| Control | Enforcement |
|---|---|
| Owner authorization | Policy changes, deposits, pause and resume are owner-only |
| Agent authorization | Only the configured agent authority can execute payments |
| Recipient allowlist | Payment recipient must match the configured recipient |
| Per-transaction limit | Individual payment cannot exceed the configured maximum |
| Daily spending limit | Aggregate spending is capped per daily window |
| Policy expiry | Payments are rejected after policy expiry |
| Emergency pause | Owner can stop payment execution |
| Vault protection | Payment must leave the required rent-exempt reserve |
| Payment event | Successful payments emit `PaymentExecuted` |

## Core instructions

- `initialize_agent` — create an agent policy
- `update_policy` — update limits, recipient and expiry
- `deposit` — fund the agent vault
- `execute_payment` — execute a policy-controlled SOL payment
- `pause_agent` — emergency stop
- `resume_agent` — resume execution

The agent state is stored in a PDA derived from:

```text
[b"agent", owner_pubkey]
```

## Repository structure

```text
guardrail/
├── programs/
│   └── guardrail/
│       ├── src/lib.rs
│       └── tests/test_guardrail.rs
├── docs/
│   └── guardrail-architecture.svg
├── Anchor.toml
├── Cargo.toml
├── Cargo.lock
└── rust-toolchain.toml
```

The next AgentPay product layer can use this program through an SDK/client without changing the core policy model.

## Test coverage

The Rust integration test exercises the full policy-enforcement path against a local Solana validator:

- initialize agent
- deposit 5 SOL
- execute valid payment
- reject wrong recipient
- reject per-transaction limit violation
- reject unauthorized agent
- enforce daily limit
- pause and resume
- reject unauthorized owner
- reject expired policy
- reject invalid policy configurations
- reject insufficient vault balance

Run locally:

```bash
# Terminal 1
solana-test-validator --reset

# Terminal 2
cd ~/guardrail
anchor build
anchor deploy
cargo test --test test_guardrail -- --nocapture
```

The test client uses `ANCHOR_WALLET` when provided and otherwise falls back to the standard Solana CLI wallet path.

## Verification

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --test test_guardrail -- --nocapture
```

## Devnet deployment

Solana Devnet is the intended public testing environment for the AgentPay MVP. Devnet uses non-production SOL and is suitable for application testing.

Configure the CLI wallet for Devnet and make sure it has enough Devnet SOL:

```bash
solana config set --url devnet
solana balance
solana airdrop 2 --url devnet
```

Build and deploy:

```bash
anchor build
anchor deploy --provider.cluster devnet
```

Or use the repository helper:

```bash
chmod +x scripts/deploy-devnet.sh
./scripts/deploy-devnet.sh
```

Anchor supports deploying to Devnet by changing the configured cluster or overriding it with `--provider.cluster devnet`.

After deployment, verify the program:

```bash
solana program show HP8ptgh4CDEwgR7rSESkfR4ZxyrLcg5VfkossDLwU5RS --url devnet
```

**Important:** the Devnet deployment must be performed with the project owner's wallet. Never commit `~/.config/solana/id.json`, private keys, seed phrases, or other credentials.

## Program

**Program ID**

```text
HP8ptgh4CDEwgR7rSESkfR4ZxyrLcg5VfkossDLwU5RS
```

**Cluster:** Solana Devnet / localnet depending on the command used.

## Current MVP scope

Supported:

- SOL payments
- one configured agent authority
- one allowed recipient
- per-transaction spending limit
- daily spending limit
- policy expiry
- pause/resume
- vault balance and rent-reserve protection
- on-chain payment event

Not yet implemented:

- SPL token payments
- multiple recipient policies
- multisignature governance
- complex role systems
- off-chain monitoring
- formal verification

These are intentionally outside the current MVP scope.

## AgentPay product roadmap

The intended product architecture is:

```text
AI Agent
   │
   ▼
AgentPay Client / SDK
   │
   ▼
Guardrail Program
   │
   ▼
Solana
```

The current repository implements the **Guardrail on-chain layer**. A lightweight AgentPay client and live Devnet demo can sit on top of the same program.

## License

MIT
