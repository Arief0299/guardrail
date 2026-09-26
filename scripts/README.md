# Deployment scripts

## Deploy Guardrail to Solana Devnet

From the repository root:

```bash
chmod +x scripts/deploy-devnet.sh
./scripts/deploy-devnet.sh
```

The script builds the Anchor program, deploys it to Devnet, and verifies the configured program ID.

The deployment wallet is read from `ANCHOR_WALLET`, or the default Solana CLI wallet at `~/.config/solana/id.json`.

Never commit private keys or seed phrases.
