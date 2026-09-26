#!/usr/bin/env bash
set -euo pipefail

PROGRAM_ID="HP8ptgh4CDEwgR7rSESkfR4ZxyrLcg5VfkossDLwU5RS"

echo "== AgentPay / Guardrail Devnet Deployment =="

command -v anchor >/dev/null || { echo "anchor CLI is required"; exit 1; }
command -v solana >/dev/null || { echo "solana CLI is required"; exit 1; }

WALLET="${ANCHOR_WALLET:-$HOME/.config/solana/id.json}"

if [ ! -f "$WALLET" ]; then
  echo "Wallet not found: $WALLET"
  exit 1
fi

echo "Wallet: $WALLET"
echo "Building program..."
anchor build

echo "Deploying to Solana Devnet..."
anchor deploy --provider.cluster devnet --provider.wallet "$WALLET"

echo "Verifying program..."
solana program show "$PROGRAM_ID" --url devnet

echo
echo "Devnet deployment complete."
echo "Program: $PROGRAM_ID"
echo "Explorer: https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
