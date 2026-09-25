# Guardrail

Guardrail is a Solana/Anchor security MVP for enforcing policy-controlled payments made by an authorized agent.

## Overview

Guardrail places explicit limits around agent-controlled SOL payments:

- owner authorization
- configured agent authorization
- allowed recipient
- per-transaction limit
- daily spending limit
- policy expiry
- pause/resume controls
- vault balance and rent-reserve protection
- payment execution event

The goal is to make payment execution deterministic: a payment is executed only when all configured policy checks pass.

## Architecture

```text
        +----------------------+
        | Policy Verification  |
        +----------------------+
                   |
                   v
        +----------------------+
        | Authorization        |
        | Recipient            |
        | Per-Tx Limit         |
        | Daily Limit          |
        | Expiry               |
        | Pause State          |
        | Vault Balance        |
        +----------+-----------+
                   |
                   v
              Payment
```

## Core Instructions

### `initialize_agent`
Creates the agent policy account and configures:

- agent authority
- maximum payment per transaction
- daily spending limit
- allowed recipient
- policy expiry

The policy account is derived as a PDA using:

```text
[b"agent", owner_pubkey]
```

### `update_policy`
Owner-only policy update. The same core validation rules apply to transaction and daily limits and expiry.

### `deposit`
Allows the owner to deposit SOL into the agent vault.

### `execute_payment`
Executes a SOL payment only after policy enforcement succeeds.

Checks include:

1. amount is greater than zero
2. agent is not paused
3. policy has not expired
4. caller matches the configured agent authority
5. recipient matches the allowed recipient
6. amount does not exceed the per-transaction limit
7. daily spending limit is not exceeded
8. vault retains the required rent reserve
9. payment is applied and the daily spending counter is updated

Successful payments emit a `PaymentExecuted` event.

### `pause_agent`
Owner-only emergency pause.

### `resume_agent`
Owner-only resume operation.

## Security Model

| Control | Purpose |
|---|---|
| Owner authorization | Restricts policy management to the configured owner |
| Agent authorization | Restricts payments to the configured agent authority |
| Recipient allowlist | Prevents payments to an unexpected recipient |
| Per-Tx limit | Caps the size of an individual payment |
| Daily limit | Caps aggregate daily spending |
| Expiry | Stops payments after the policy expires |
| Pause | Provides an owner-controlled emergency stop |
| Vault balance check | Prevents spending into the account's rent reserve |
| Payment event | Provides an on-chain record of successful payments |

## Test Coverage

The integration test covers:

| Test | Result |
|---|---|
| Initialize agent | PASS |
| Deposit 5 SOL | PASS |
| Valid payment | PASS |
| Wrong recipient rejected | PASS |
| Per-transaction limit enforced | PASS |
| Unauthorized agent rejected | PASS |
| Daily limit enforced | PASS |
| Pause blocks payment | PASS |
| Resume agent | PASS |

Latest integration test result:

```text
1 passed; 0 failed
ALL GUARDRAIL TESTS PASSED
```

## Verification

Run formatting checks:

```bash
cargo fmt --all -- --check
```

Run Clippy with warnings denied:

```bash
cargo clippy --workspace --all-targets -- -D warnings
```

Run the Guardrail integration test:

```bash
cargo test --test test_guardrail -- --nocapture
```

For local development, the program must be deployed to the local validator before running the integration test:

```bash
anchor build
anchor deploy
```

If the local validator contains an existing deterministic agent PDA, restart it with a reset before redeploying:

```pkill -f solana-test-validator
solana-test-validator --reset
```

## Program ID

```text
HP8ptgh4CDEwgR7rSESkfR4ZxyrLcg5VfkossDLwU5RS
```

## Current Scope

This MVP focuses on policy-controlled SOL payments.

It does not currently implement:

- SPL token payments
- multisignature governance
- multiple recipient policies
- complex role systems
- off-chain monitoring
- formal verification

These can be added as future extensions.

## License

MIT
