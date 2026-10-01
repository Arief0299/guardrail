import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import "./style.css";

const PROGRAM_ID = new PublicKey(
  "HP8ptgh4CDEwgR7rSESkfR4ZxyrLcg5VfkossDLwU5RS",
);
const SYSTEM_PROGRAM_ID = SystemProgram.programId;
const RPC_URL = "https://api.devnet.solana.com";
const EXPLORER_BASE = "https://explorer.solana.com/tx/";
const MAX_TX_LAMPORTS = 5_000_000;
const DAILY_LIMIT_LAMPORTS = 10_000_000;
const DEMO_DEPOSIT_LAMPORTS = 12_000_000;
// The connected Devnet wallet is also the demo recipient.\n// This keeps the live product self-contained: no second wallet is required.

// Anchor instruction discriminators from the deployed Guardrail IDL.
const IX = {
  deposit: Uint8Array.from([242, 35, 198, 137, 82, 225, 242, 182]),
  executePayment: Uint8Array.from([86, 4, 7, 7, 120, 139, 232, 139]),
  initializeAgent: Uint8Array.from([212, 81, 156, 211, 212, 110, 21, 28]),
  resetDailySpend: Uint8Array.from([174, 162, 143, 213, 170, 123, 48, 42]),
};

type WalletProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string };
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  disconnect?: () => Promise<void>;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  signAndSendTransaction?: (
    transaction: Transaction,
    options?: {
      skipPreflight?: boolean;
      maxRetries?: number;
      preflightCommitment?: "processed" | "confirmed" | "finalized";
    },
  ) => Promise<{ signature: string }>;
  sendTransaction?: (
    transaction: Transaction,
    connection: Connection,
    options?: {
      skipPreflight?: boolean;
      maxRetries?: number;
      preflightCommitment?: "processed" | "confirmed" | "finalized";
    },
  ) => Promise<string>;
};

declare global {
  interface Window {
    phantom?: {
      solana?: WalletProvider;
    };
  }
}

type AgentState = {
  owner: PublicKey;
  agentAuthority: PublicKey;
  maxPerTransaction: bigint;
  dailyLimit: bigint;
  spentToday: bigint;
  expiry: bigint;
  allowedRecipient: PublicKey;
  paused: boolean;
};

const connection = new Connection(RPC_URL, "confirmed");

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <a class="brand" href="/">
        <span class="brand-mark"><img src="/agentpay-logo.svg" alt="AgentPay" /></span>
        <span>
          <strong>AgentPay</strong>
          <small>Spending Guardrails</small>
        </span>
      </a>
      <div class="network"><span></span> SOLANA DEVNET</div>
    </header>

    <main>
      <section class="hero">
        <div class="eyebrow">ON-CHAIN CONTROL LAYER FOR AUTONOMOUS AGENTS</div>
        <h1>Let agents act.<br /><em>Keep spending bounded.</em></h1>
        <p class="hero-copy">
          AgentPay enforces programmable spending policies directly on Solana,
          so an autonomous agent can execute payments without getting unlimited spending authority.
        </p>
        <div class="hero-actions">
          <button id="connect" class="primary">Connect Wallet</button>
          <a
            class="secondary"
            href="https://explorer.solana.com/address/HP8ptgh4CDEwgR7rSESkfR4ZxyrLcg5VfkossDLwU5RS?cluster=devnet"
            target="_blank"
            rel="noreferrer"
          >View Program ↗</a>
        </div>
        <div id="wallet" class="wallet-line">No wallet connected</div>
      </section>

      <section class="grid">
        <article class="card policy-card">
          <div class="card-head">
            <div>
              <span class="kicker">POLICY</span>
              <h2>Programmable boundaries</h2>
            </div>
            <span id="policy-status" class="status neutral">NOT READY</span>
          </div>

          <div class="policy-grid">
            <div><span>Agent authority</span><strong id="agent">—</strong></div>
            <div><span>Allowed recipient</span><strong id="recipient">—</strong></div>
            <div><span>Per transaction</span><strong>0.005 SOL</strong></div>
            <div><span>Daily limit</span><strong>0.010 SOL</strong></div>
            <div><span>Policy expiry</span><strong>24 hours</strong></div>
            <div><span>Paused</span><strong id="paused">—</strong></div>
          </div>

          <div class="setup">
            <button id="setup" class="primary wide" disabled>Initialize Policy</button>
            <button id="refresh" class="ghost wide" disabled>Refresh Policy</button>
            <button id="reset" class="ghost wide" disabled>Reset Daily Spend</button>
          </div>
          <p class="hint">
            On first use, AgentPay creates a policy owned by your connected Devnet wallet
            and funds its vault with 0.012 SOL.
          </p>
        </article>

        <article class="card action-card">
          <div class="card-head">
            <div>
              <span class="kicker">PAYMENT GATE</span>
              <h2>Test the guardrail</h2>
            </div>
            <span class="lock">DEVNET</span>
          </div>

          <div class="request valid">
            <div>
              <span>VALID REQUEST</span>
              <strong>0.005 SOL</strong>
              <small>Within configured transaction limit</small>
            </div>
            <button id="approve" class="approve" disabled>Execute Payment</button>
          </div>

          <div class="request danger">
            <div>
              <span>OVER-LIMIT REQUEST</span>
              <strong>0.009 SOL</strong>
              <small>Sent to the program to verify on-chain rejection</small>
            </div>
            <button id="reject" class="reject" disabled>Test On-Chain Rejection</button>
          </div>

          <div id="result" class="result neutral">
            <span class="result-dot"></span>
            <div>
              <strong>Waiting for a policy</strong>
              <p>Connect your wallet and initialize the Devnet demo.</p>
            </div>
          </div>
        </article>
      </section>

      <section class="verification">
        <div>
          <span class="kicker">GUARDRAIL VERIFIED</span>
          <h2>Rules are enforced by the program, not by the UI.</h2>
          <p>
            A valid payment can pass. An over-limit payment is submitted to the
            deployed Solana program and rejected on-chain with <code>PerTransactionLimitExceeded</code>.
          </p>
        </div>
        <div class="checks">
          <span>✓ Agent authorization</span>
          <span>✓ Recipient allowlist</span>
          <span>✓ Per-tx limit</span>
          <span>✓ Daily limit</span>
          <span>✓ Policy expiry</span>
          <span>✓ Pause / resume</span>
        </div>
      </section>

      <footer>
        <span>AgentPay · Solana Devnet</span>
        <a
          href="https://github.com/Arief0299/guardrail"
          target="_blank"
          rel="noreferrer"
        >Source on GitHub ↗</a>
      </footer>
    </main>

    <div id="toast" class="toast"></div>
  </div>
`;

const $ = <T extends Element>(selector: string) =>
  document.querySelector<T>(selector)!;

const connectButton = $<HTMLButtonElement>("#connect");
const setupButton = $<HTMLButtonElement>("#setup");
const refreshButton = $<HTMLButtonElement>("#refresh");
const resetButton = $<HTMLButtonElement>("#reset");
const approveButton = $<HTMLButtonElement>("#approve");
const rejectButton = $<HTMLButtonElement>("#reject");
const walletLine = $<HTMLDivElement>("#wallet");
const policyStatus = $<HTMLSpanElement>("#policy-status");
const resultBox = $<HTMLDivElement>("#result");
const toast = $<HTMLDivElement>("#toast");

let wallet: WalletProvider | null = null;
let owner: PublicKey | null = null;
let agentPda: PublicKey | null = null;
let agentState: AgentState | null = null;
let busy = false;

function explorer(signature: string) {
  return `${EXPLORER_BASE}${signature}?cluster=devnet`;
}

function shortKey(key: PublicKey | string) {
  const value = typeof key === "string" ? key : key.toBase58();
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function setBusy(value: boolean) {
  busy = value;
  [connectButton, setupButton, refreshButton, resetButton, approveButton, rejectButton].forEach(
    (button) => {
      if (button === connectButton) {
        button.disabled = value;
      }
    },
  );
  if (value) {
    [setupButton, refreshButton, resetButton, approveButton, rejectButton].forEach(
      (button) => (button.disabled = true),
    );
  } else {
    updateButtons();
  }
}

function showToast(message: string) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 3200);
}

function setResult(
  type: "neutral" | "success" | "danger",
  title: string,
  message: string,
  signature?: string,
) {
  resultBox.className = `result ${type}`;
  resultBox.innerHTML = `
    <span class="result-dot"></span>
    <div>
      <strong>${title}</strong>
      <p>${message}</p>
      ${signature ? `<a href="${explorer(signature)}" target="_blank" rel="noreferrer">View transaction on Solana Explorer ↗</a>` : ""}
    </div>
  `;
}

function updateButtons() {
  const ready = Boolean(wallet && owner && agentState && !agentState.paused);
  setupButton.disabled = busy || !wallet || !owner || Boolean(agentState);
  refreshButton.disabled = busy || !wallet || !owner;
  resetButton.disabled = busy || !wallet || !owner || !agentState;
  approveButton.disabled = busy || !ready;
  rejectButton.disabled = busy || !ready;
}

function writeU64(value: bigint) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
}

function writeI64(value: bigint) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigInt64(0, value, true);
  return bytes;
}

function concat(...parts: Uint8Array[]) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function accountDataFrom(info: Awaited<ReturnType<typeof connection.getAccountInfo>>) {
  if (!info) return null;
  return new Uint8Array(info.data);
}

function parseAgent(data: Uint8Array, walletOwner: PublicKey): AgentState {
  // 8-byte Anchor account discriminator, then the Agent struct fields.
  let offset = 8;
  const readPubkey = () => {
    const key = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    return key;
  };
  const readU64 = () => {
    const value = new DataView(data.buffer, data.byteOffset + offset, 8).getBigUint64(
      0,
      true,
    );
    offset += 8;
    return value;
  };
  const readI64 = () => {
    const value = new DataView(data.buffer, data.byteOffset + offset, 8).getBigInt64(
      0,
      true,
    );
    offset += 8;
    return value;
  };

  const parsedOwner = readPubkey();
  const agentAuthority = readPubkey();
  const maxPerTransaction = readU64();
  const dailyLimit = readU64();
  const spentToday = readU64();
  readI64(); // day_start
  const allowedRecipient = readPubkey();
  const expiry = readI64();
  const paused = data[offset] === 1;

  if (!parsedOwner.equals(walletOwner)) {
    throw new Error("This policy belongs to a different owner.");
  }

  return {
    owner: parsedOwner,
    agentAuthority,
    maxPerTransaction,
    dailyLimit,
    spentToday,
    expiry,
    allowedRecipient,
    paused,
  };
}

function instruction(
  keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[],
  data: Uint8Array,
) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data: Uint8Array.from(data) as unknown as TransactionInstruction["data"],
  });
}

async function sendTransaction(transaction: Transaction) {
  if (!wallet || !owner) throw new Error("Connect a wallet first.");

  const latest = await connection.getLatestBlockhash("confirmed");

  transaction.feePayer = owner;
  transaction.recentBlockhash = latest.blockhash;

  console.log("=== AGENTPAY TRANSACTION ===");
  console.log("feePayer:", transaction.feePayer.toBase58());
  console.log("recentBlockhash:", transaction.recentBlockhash);
  console.log("instructionCount:", transaction.instructions.length);

  let signature: string;

  try {
    if (wallet.signAndSendTransaction) {
      console.log("Using Phantom signAndSendTransaction()");

      const result = await wallet.signAndSendTransaction(transaction, {
        skipPreflight: false,
        maxRetries: 3,
        preflightCommitment: "confirmed",
      });

      signature = result.signature;
    } else if (wallet.sendTransaction) {
      console.log("Using Phantom sendTransaction()");

      signature = await wallet.sendTransaction(transaction, connection, {
        skipPreflight: false,
        maxRetries: 3,
        preflightCommitment: "confirmed",
      });
    } else {
      console.log("Using fallback signTransaction()");

      const signed = await wallet.signTransaction(transaction);

      signature = await connection.sendRawTransaction(
        signed.serialize(),
        {
          skipPreflight: false,
          maxRetries: 3,
        },
      );
    }

    console.log("Submitted signature:", signature);

    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      },
      "confirmed",
    );

    console.log("Confirmation error:", confirmation.value.err);

    return {
      signature,
      error: confirmation.value.err,
    };
  } catch (error) {
    console.error("AgentPay sendTransaction error:", error);

    throw error instanceof Error
      ? error
      : new Error("Transaction failed.");
  }
}

async function fetchPolicy() {
  if (!owner) return null;
  const [pda] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("agent"), owner.toBytes()],
    PROGRAM_ID,
  );
  agentPda = pda;

  const info = await connection.getAccountInfo(pda, "confirmed");
  if (!info) {
    agentState = null;
    policyStatus.textContent = "NOT CREATED";
    policyStatus.className = "status neutral";
    return null;
  }

  const parsed = parseAgent(accountDataFrom(info)!, owner);
  agentState = parsed;

  const balance = await connection.getBalance(pda, "confirmed");
  const expiry = new Date(Number(parsed.expiry) * 1000);

  $("#agent").textContent = shortKey(parsed.agentAuthority);
  $("#recipient").textContent = shortKey(parsed.allowedRecipient);
  $("#paused").textContent = parsed.paused ? "YES" : "NO";
  policyStatus.textContent = parsed.paused ? "PAUSED" : "ACTIVE";
  policyStatus.className = `status ${parsed.paused ? "danger" : "success"}`;

  const existingHint = document.querySelector(".policy-expiry");
  if (existingHint) existingHint.remove();

  const hint = document.createElement("div");
  hint.className = "policy-expiry";
  hint.textContent = `Expires ${expiry.toLocaleString()} · Vault ${(
    balance / 1_000_000_000
  ).toFixed(3)} SOL`;
  document.querySelector(".policy-grid")?.appendChild(hint);

  if (!parsed.agentAuthority.equals(owner)) {
    setResult(
      "danger",
      "Agent authority mismatch",
      "This wallet owns the policy, but a different agent authority is configured. Use a fresh Devnet wallet for the live demo.",
    );
  }

  updateButtons();
  return parsed;
}

async function connectWallet() {
  const phantom = window.phantom?.solana;

  if (!phantom) {
    showToast("Phantom wallet not detected. Install Phantom and refresh.");
    return;
  }

  try {
    console.log("=== AGENTPAY PHANTOM PROVIDER ===");
    console.log("isPhantom:", phantom.isPhantom);
    console.log("provider:", phantom);

    const response = await phantom.connect();

    wallet = phantom;
    owner = new PublicKey(response.publicKey.toString());

    console.log("Phantom public key:", owner.toBase58());

    walletLine.textContent = `Connected: ${shortKey(owner)}`;
    connectButton.textContent = "Wallet Connected";
    connectButton.classList.add("connected");
    setupButton.disabled = false;
    refreshButton.disabled = false;

    await fetchPolicy();

    if (!agentState) {
      setResult(
        "neutral",
        "Ready to initialize",
        "Create a Devnet policy and fund the Guardrail vault with 0.012 SOL.",
      );
    }

    updateButtons();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Wallet connection failed.");
  }
}

async function initializePolicy() {
  if (!wallet || !owner || !agentPda) return;
  setBusy(true);
  setResult("neutral", "Waiting for wallet", "Approve the policy initialization transaction in your wallet.");

  try {
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 86_400);
    const data = concat(
      IX.initializeAgent,
      owner.toBytes(),
      writeU64(BigInt(MAX_TX_LAMPORTS)),
      writeU64(BigInt(DAILY_LIMIT_LAMPORTS)),
      owner.toBytes(),
      writeI64(expiry),
    );

    const tx = new Transaction().add(
      instruction(
        [
          { pubkey: owner, isSigner: true, isWritable: true },
          { pubkey: agentPda, isSigner: false, isWritable: true },
          { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data,
      ),
    );

    const result = await sendTransaction(tx);
    if (result.error) {
      throw new Error("Policy initialization failed on-chain.");
    }

    setResult(
      "success",
      "Policy created on-chain",
      "The Guardrail policy is now owned by your wallet.",
      result.signature,
    );
    await depositVault();
  } catch (error) {
    setResult(
      "danger",
      "Policy initialization failed",
      error instanceof Error ? error.message : "Transaction failed.",
    );
  } finally {
    setBusy(false);
    await fetchPolicy();
  }
}

async function depositVault() {
  if (!wallet || !owner || !agentPda) return;

  setResult(
    "neutral",
    "Fund the Guardrail vault",
    "Approve the 0.012 SOL Devnet deposit in your wallet.",
  );

  const data = concat(IX.deposit, writeU64(BigInt(DEMO_DEPOSIT_LAMPORTS)));
  const tx = new Transaction().add(
    instruction(
      [
        { pubkey: agentPda, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    ),
  );

  const result = await sendTransaction(tx);
  if (result.error) {
    throw new Error("Vault funding failed on-chain.");
  }

  setResult(
    "success",
    "Vault funded",
    "0.012 SOL is now available to the Guardrail policy.",
    result.signature,
  );
}

async function resetDailySpend() {
  if (!wallet || !owner || !agentPda || !agentState) return;

  setBusy(true);
  setResult(
    "neutral",
    "Waiting for wallet",
    "Approve the daily spending reset transaction in your wallet.",
  );

  try {
    const data = IX.resetDailySpend;

    const tx = new Transaction().add(
      instruction(
        [
          {
            pubkey: agentPda,
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: owner,
            isSigner: true,
            isWritable: false,
          },
        ],
        data,
      ),
    );

    const result = await sendTransaction(tx);

    if (result.error) {
      throw new Error("Daily spending reset failed on-chain.");
    }

    setResult(
      "success",
      "Daily spend reset",
      "The on-chain daily spending counter has been reset to 0.",
      result.signature,
    );
  } catch (error) {
    setResult(
      "danger",
      "Reset failed",
      error instanceof Error ? error.message : "Transaction failed.",
    );
  } finally {
    setBusy(false);
    await fetchPolicy();
  }
}

async function sendExpectedFailureTransaction(transaction: Transaction) {
  if (!wallet || !owner) throw new Error("Connect a wallet first.");

  const latest = await connection.getLatestBlockhash("confirmed");

  transaction.feePayer = owner;
  transaction.recentBlockhash = latest.blockhash;

  console.log("=== AGENTPAY REJECTION SIMULATION ===");
  console.log("feePayer:", owner.toBase58());
  console.log("recentBlockhash:", latest.blockhash);

  const simulation = await connection.simulateTransaction(transaction);

  console.log("Simulation error:", simulation.value.err);
  console.log("Simulation logs:", simulation.value.logs);

  return {
    signature: undefined,
    error: simulation.value.err,
    logs: simulation.value.logs ?? [],
  };
}

function extractProgramError(logs: string[]) {
  const anchorLog = logs.find((log) => log.includes("Error Code:"));

  if (!anchorLog) return null;

  const match = anchorLog.match(/Error Code:\s*([A-Za-z0-9_]+)/);
  return match?.[1] ?? null;
}

async function executePayment(
  amountLamports: number,
  isExpectedRejection: boolean,
) {
  if (!wallet || !owner || !agentPda || !agentState) return;

  setBusy(true);

  const amount = BigInt(amountLamports);
  const label = isExpectedRejection ? "0.009 SOL" : "0.005 SOL";

  try {
    // For the valid payment, keep the UX pre-checks.
    // The rejection test intentionally skips them so the program itself
    // becomes the source of truth for the rejection.
    if (!isExpectedRejection) {
      const now = BigInt(Math.floor(Date.now() / 1000));

      if (amount > agentState.maxPerTransaction) {
        setResult(
          "danger",
          "PAYMENT REJECTED",
          `${label} exceeds the configured transaction limit.`,
        );
        return;
      }

      if (now > agentState.expiry) {
        setResult(
          "danger",
          "PAYMENT REJECTED",
          "The Guardrail policy has expired.",
        );
        return;
      }

      if (agentState.paused) {
        setResult(
          "danger",
          "PAYMENT REJECTED",
          "The Guardrail policy is currently paused.",
        );
        return;
      }

      const nextDailyTotal = agentState.spentToday + amount;

      if (nextDailyTotal > agentState.dailyLimit) {
        setResult(
          "danger",
          "PAYMENT REJECTED",
          `${label} would exceed the daily spending limit.`,
        );
        return;
      }
    }

    const data = concat(
      IX.executePayment,
      writeU64(amount),
    );

    const tx = new Transaction().add(
      instruction(
        [
          {
            pubkey: agentPda,
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: owner,
            isSigner: true,
            isWritable: false,
          },
          {
            pubkey: owner,
            isSigner: false,
            isWritable: true,
          },
        ],
        data,
      ),
    );

    if (isExpectedRejection) {
      setResult(
        "neutral",
        "Testing on-chain guardrail",
        "Testing the deployed AgentPay program on Solana Devnet. The program should reject this 0.009 SOL request.",
      );

      const result = await sendExpectedFailureTransaction(tx);
      const programError = extractProgramError(result.logs);

      if (!result.error) {
        setResult(
          "danger",
          "Unexpected payment success",
          "The 0.009 SOL transaction unexpectedly succeeded. Verify the deployed policy.",
          result.signature,
        );
        return;
      }

      if (programError === "PerTransactionLimitExceeded") {
        setResult(
          "success",
          "ON-CHAIN GUARDRAIL VERIFIED",
          "PerTransactionLimitExceeded — the deployed AgentPay program rejected the 0.009 SOL request during Devnet execution. No payment was executed.",
          result.signature,
        );
      } else {
        setResult(
          "danger",
          "ON-CHAIN TRANSACTION REJECTED",
          programError
            ? `AgentPay rejected the transaction with ${programError}.`
            : "The AgentPay program rejected the transaction. Check the transaction logs.",
          result.signature,
        );
      }

      return;
    }

    setResult(
      "neutral",
      "Waiting for wallet",
      `Approve the ${label} payment request in your wallet.`,
    );

    const result = await sendTransaction(tx);

    if (result.error) {
      throw new Error("Payment was rejected by the Guardrail.");
    }

    setResult(
      "success",
      "PAYMENT APPROVED",
      "0.005 SOL was executed within the configured policy.",
      result.signature,
    );
  } catch (error) {
    setResult(
      "danger",
      isExpectedRejection ? "On-chain test failed" : "Payment failed",
      error instanceof Error ? error.message : "Transaction failed.",
    );
  } finally {
    setBusy(false);
    await fetchPolicy();
  }
}

connectButton.addEventListener("click", connectWallet);
setupButton.addEventListener("click", initializePolicy);
resetButton.addEventListener("click", resetDailySpend);
refreshButton.addEventListener("click", async () => {
  setBusy(true);
  try {
    await fetchPolicy();
    showToast("Policy refreshed from Solana Devnet.");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Refresh failed.");
  } finally {
    setBusy(false);
  }
});
approveButton.addEventListener("click", () => executePayment(MAX_TX_LAMPORTS, false));
rejectButton.addEventListener("click", () => executePayment(9_000_000, true));

window.setTimeout(() => updateButtons(), 0);
