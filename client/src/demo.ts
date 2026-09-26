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
  console.log("=== AgentPay Devnet Demo ===");
  console.log(`RPC: ${RPC_URL}`);
  console.log(`Program: ${PROGRAM_ID.toBase58()}`);

  const payer = loadKeypair(walletPath);
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new KeypairWallet(payer);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  const program = new Program(idl as any, provider);

  // Generate fresh demo identities so the demo can be repeated without
  // colliding with the deterministic PDA owned by the CLI wallet.
  const demoOwner = Keypair.generate();
  const agentAuthority = Keypair.generate();
  const recipient = Keypair.generate();

  console.log(`Demo owner:      ${demoOwner.publicKey.toBase58()}`);
  console.log(`Agent authority: ${agentAuthority.publicKey.toBase58()}`);
  console.log(`Recipient:       ${recipient.publicKey.toBase58()}`);

  console.log("\n[1/5] Funding demo owner...");
  const fundingSig = await transferSol(
    connection,
    payer,
    demoOwner.publicKey,
    20_000_000,
  );
  console.log(explorer(fundingSig));

  const [agentPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), demoOwner.publicKey.toBuffer()],
    PROGRAM_ID,
  );

  const expiry = Math.floor(Date.now() / 1000) + 86_400;
  const maxPerTransaction = new BN(1_000_000);
  const dailyLimit = new BN(2_000_000);

  console.log("\n[2/5] Creating AgentPay policy...");
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

  console.log(explorer(initializeSig));

  console.log("\n[3/5] Funding Guardrail vault...");
  const depositSig = await program.methods
    .deposit(new BN(5_000_000))
    .accounts({
      agent: agentPda,
      owner: demoOwner.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([demoOwner])
    .rpc();

  console.log(explorer(depositSig));

  console.log("\n[4/5] Agent requests an allowed 0.005 SOL payment...");
  const paymentSig = await program.methods
    .executePayment(new BN(5_000_000))
    .accounts({
      agent: agentPda,
      agentAuthority: agentAuthority.publicKey,
      recipient: recipient.publicKey,
    })
    .signers([agentAuthority])
    .rpc();

  console.log("APPROVED");
  console.log(explorer(paymentSig));

  console.log("\n[5/5] Agent requests an over-limit payment...");
  try {
    await program.methods
      .executePayment(new BN(2_000_000))
      .accounts({
        agent: agentPda,
        agentAuthority: agentAuthority.publicKey,
        recipient: recipient.publicKey,
      })
      .signers([agentAuthority])
      .rpc();

    throw new Error("Guardrail unexpectedly approved an over-limit payment");
  } catch (error) {
    console.log("REJECTED by Guardrail (expected)");
    console.log(
      error instanceof Error ? error.message : String(error),
    );
  }

  console.log("\n=== Demo complete ===");
  console.log("The successful payment and rejected policy violation were both exercised on Devnet.");
}

main().catch((error) => {
  console.error("\nAgentPay demo failed:");
  console.error(error);
  process.exit(1);
});
