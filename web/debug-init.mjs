import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  Message,
} from "@solana/web3.js";

const RPC = "https://api.devnet.solana.com";

const PROGRAM_ID = new PublicKey(
  "HP8ptgh4CDEwgR7rSESkfR4ZxyrLcg5VfkossDLwU5RS",
);

const OWNER = new PublicKey(
  "DrVfUemNfDKcMSSHq8KQ6LsQe9jV34jRwbpZX374eAHh",
);

const connection = new Connection(RPC, "confirmed");

const [agentPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("agent"), OWNER.toBuffer()],
  PROGRAM_ID,
);

function u64(value) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(value));
  return b;
}

function i64(value) {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(value));
  return b;
}

const discriminator = Buffer.from([
  212, 81, 156, 211, 212, 110, 21, 28,
]);

const expiry = Math.floor(Date.now() / 1000) + 86400;

const data = Buffer.concat([
  discriminator,
  OWNER.toBuffer(),
  u64(5_000_000),
  u64(10_000_000),
  OWNER.toBuffer(),
  i64(expiry),
]);

const instruction = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    {
      pubkey: OWNER,
      isSigner: true,
      isWritable: true,
    },
    {
      pubkey: agentPda,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
  ],
  data,
});

const { blockhash, lastValidBlockHeight } =
  await connection.getLatestBlockhash("confirmed");

const tx = new Transaction({
  feePayer: OWNER,
  recentBlockhash: blockhash,
});

tx.add(instruction);

console.log("RPC:", RPC);
console.log("Program:", PROGRAM_ID.toBase58());
console.log("Owner:", OWNER.toBase58());
console.log("Agent PDA:", agentPda.toBase58());
console.log("Expiry:", expiry);
console.log("Data length:", data.length);
console.log("Blockhash:", blockhash);
console.log("Last valid block height:", lastValidBlockHeight);

console.log("\n=== TRANSACTION ===");
console.log("Fee payer:", tx.feePayer.toBase58());
console.log("Instruction count:", tx.instructions.length);
console.log("Program ID:", tx.instructions[0].programId.toBase58());
console.log("Data length:", tx.instructions[0].data.length);
console.log(
  "Discriminator:",
  JSON.stringify(Array.from(tx.instructions[0].data.slice(0, 8))),
);

console.log("\n=== BALANCE ===");
const balance = await connection.getBalance(OWNER, "confirmed");
console.log("Balance:", balance, "lamports");
console.log("Balance SOL:", balance / 1_000_000_000);

console.log("\n=== FEE ESTIMATE ===");

const message = tx.compileMessage();

const fee = await connection.getFeeForMessage(message, "confirmed");

console.log("Fee:", fee.value, "lamports");
console.log(
  "Fee SOL:",
  fee.value === null ? "null" : fee.value / 1_000_000_000,
);

console.log(
  "Balance after fee:",
  fee.value === null
    ? "unknown"
    : `${(balance - fee.value) / 1_000_000_000} SOL`,
);

console.log("\n=== SIMULATION ===");

const simulation = await connection.simulateTransaction(tx);

console.log("err:", simulation.value.err);
console.log("unitsConsumed:", simulation.value.unitsConsumed);
console.log("returnData:", simulation.value.returnData);

console.log("logs:");

for (const log of simulation.value.logs ?? []) {
  console.log(log);
}
