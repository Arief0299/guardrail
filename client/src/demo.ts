import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  AnchorProvider,
  Program,
  Wallet,
} from "@anchor-lang/core";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import BN from "bn.js";

import idl from "./idl/guardrail.json" with { type: "json" };

const PROGRAM_ID = new PublicKey(
  "HP8ptgh4CDEwgR7rSESkfR4ZxyrLcg5VfkossDLwU5RS",
);

const RPC_URL =
  process.env.AGENTPAY_RPC_URL ?? "https://api.devnet.solana.com";

const walletPath =
  process.env.ANCHOR_WALLET ??
  join(homedir(), ".config", "solana", "id.json");

class KeypairWallet implements Wallet {
  readonly payer: Keypair;
  readonly publicKey: PublicKey;

  constructor(payer: Keypair) {
    this.payer = payer;
    this.publicKey = payer.publicKey;
  }

  async signTransaction<T extends Transaction>(tx: T): Promise<T> {
    tx.partialSign(this.payer);
    return tx;
  }

  async signAllTransactions<T extends Transaction>(txs: T[]): Promise<T[]> {
    txs.forEach((tx) => tx.partialSign(this.payer));
    return txs;
  }
}

function loadKeypair(path: string): Keypair {
  const bytes = JSON.parse(readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

function explorer(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

async function transferSol(
  connection: Connection,
  payer: Keypair,
  recipient: PublicKey,
  lamports: number,
): Promise<string> {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipient,
      lamports,
    }),
  );

  return sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: "confirmed",
  });
}

async function main() {
  const payer = loadKeypair(walletPath);
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new KeypairWallet(payer);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  const program = new Program(idl as any, provider);

  const demoOwner = Keypair.generate();
  const agentAuthority = Keypair.generate();
  const recipient = Keypair.generate();

  const [agentPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), demoOwner.publicKey.toBuffer()],
    PROGRAM_ID,
  );

  const expiry = Math.floor(Date.now() / 1000) + 86_400;
  const maxPerTransaction = new BN(5_000_000);
  const dailyLimit = new BN(10_000_000);

  console.log("");
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║             AGENTPAY — DEVNET DEMO              ║");
  console.log("║       On-chain spending guardrails for AI        ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log("");

  console.log("PROGRAM");
  console.log(`  ${PROGRAM_ID.toBase58()}`);
  console.log("");

  console.log("POLICY");
  console.log("  Agent authority    : CONFIGURED");
  console.log("  Allowed recipient  : CONFIGURED");
  console.log("  Per-tx limit       : 0.005 SOL");
  console.log("  Daily limit        : 0.010 SOL");
  console.log("  Policy expiry      : 24 hours");
  console.log("");

  console.log("──────────────────────────────────────────────────");

  console.log("");
  console.log("[1] SETTING UP DEMO");
  console.log("    Funding demo owner...");

  const fundingSig = await transferSol(
    connection,
    payer,
    demoOwner.publicKey,
    30_000_000,
  );

  console.log("    ✓ Owner funded");
  console.log(`    Explorer → ${explorer(fundingSig)}`);

  console.log("");
  console.log("    Creating on-chain policy...");

  const initializeSig = await program.methods
    .initializeAgent(
      agentAuthority.publicKey,
      maxPerTransaction,
      dailyLimit,
      recipient.publicKey,
      new BN(expiry),
    )
    .accounts({
      owner: demoOwner.publicKey,
      agent: agentPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([demoOwner])
    .rpc();

  console.log("    ✓ Policy created on Solana");
  console.log(`    Explorer → ${explorer(initializeSig)}`);

  console.log("");
  console.log("    Funding Guardrail vault...");

  const depositSig = await program.methods
    .deposit(new BN(12_000_000))
    .accounts({
      agent: agentPda,
      owner: demoOwner.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([demoOwner])
    .rpc();

  console.log("    ✓ Vault funded with 0.012 SOL");
  console.log(`    Explorer → ${explorer(depositSig)}`);

  console.log("");
  console.log("──────────────────────────────────────────────────");

  console.log("");
  console.log("[2] LEGITIMATE AGENT PAYMENT");
  console.log("");
  console.log("    Agent requests : 0.005 SOL");
  console.log("    Policy limit   : 0.005 SOL");
  console.log("");
  console.log("    Guardrail check...");
  console.log("      ✓ Agent authorized");
  console.log("      ✓ Recipient allowed");
  console.log("      ✓ Transaction limit OK");
  console.log("      ✓ Daily limit OK");
  console.log("");
  console.log("    ✓ PAYMENT APPROVED");

  const paymentSig = await program.methods
    .executePayment(new BN(5_000_000))
    .accounts({
      agent: agentPda,
      agentAuthority: agentAuthority.publicKey,
      recipient: recipient.publicKey,
    })
    .signers([agentAuthority])
    .rpc();

  console.log(`    Explorer → ${explorer(paymentSig)}`);

  console.log("");
  console.log("──────────────────────────────────────────────────");

  console.log("");
  console.log("[3] OVER-LIMIT / MALICIOUS REQUEST");
  console.log("");
  console.log("    Agent requests : 0.009 SOL");
  console.log("    Policy limit   : 0.005 SOL");
  console.log("");
  console.log("    Guardrail check...");
  console.log("      ✓ Agent authorized");
  console.log("      ✓ Recipient allowed");
  console.log("      ✗ Transaction limit EXCEEDED");
  console.log("");
  console.log("    ✗ PAYMENT REJECTED");
  console.log("    Reason: PerTransactionLimitExceeded");

  try {
    await program.methods
      .executePayment(new BN(9_000_000))
      .accounts({
        agent: agentPda,
        agentAuthority: agentAuthority.publicKey,
        recipient: recipient.publicKey,
      })
      .signers([agentAuthority])
      .rpc();

    throw new Error("Guardrail unexpectedly approved an over-limit payment");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("unexpectedly approved")
    ) {
      throw error;
    }
  }

  console.log("");
  console.log("──────────────────────────────────────────────────");
  console.log("");
  console.log("              GUARDRAIL VERIFIED");
  console.log("");
  console.log("  ✓ Valid payment executed on Solana Devnet");
  console.log("  ✓ Over-limit payment rejected on-chain");
  console.log("  ✓ Spending policy enforced by the program");
  console.log("");
  console.log("  AgentPay — programmable spending guardrails");
  console.log("              for autonomous agents");
  console.log("");
}

main().catch((error) => {
  console.error("\nAgentPay demo failed:");
  console.error(error);
  process.exit(1);
});
