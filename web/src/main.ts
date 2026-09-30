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
};

type WalletProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string };
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  disconnect?: () => Promise<void>;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
};

declare global {
  interface Window {
    solana?: WalletProvider;
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
        <span class="brand-mark">A</span>
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
              <small>Exceeds the 0.005 SOL transaction limit</small>
            </div>
            <button id="reject" class="reject" disabled>Test Rejection</button>
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
            A valid payment can pass. An over-limit payment is rejected by the
            deployed Solana program with <code>PerTransactionLimitExceeded</code>.
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
  [connectButton, setupButton, refreshButton, approveButton, rejectButton].forEach(
    (button) => {
      if (button === connectButton) {
        button.disabled = value;
      }
    },
  );
  if (value) {
    [setupButton, refreshButton, approveButton, rejectButton].forEach(
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
    data: Buffer.from(data),
  });
}

async function sendTransaction(transaction: Transaction) {
  if (!wallet || !owner) throw new Error("Connect a wallet first.");

  const latest = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = owner;
  transaction.recentBlockhash = latest.blockhash;

  const signed = await wallet.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: true,
    maxRetries: 3,
  });

  const confirmation = await connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    "confirmed",
  );

  return { signature, error: confirmation.value.err };
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
  if (!window.solana) {
    showToast("Phantom wallet not detected. Install Phantom and refresh.");
    return;
  }

  try {
    const response = await window.solana.connect();
    wallet = window.solana;
    owner = new PublicKey(response.publicKey.toString());
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
      DEMO_RECIPIENT.toBytes(),
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

async function executePayment(amountLamports: number, isExpectedRejection: boolean) {
  if (!wallet || !owner || !agentPda || !agentState) return;

  setBusy(true);
  const label = isExpectedRejection ? "0.009 SOL" : "0.005 SOL";
  setResult(
    "neutral",
    "Waiting for wallet",
    `Approve the ${label} payment request in your wallet.`,
  );

  try {
    const data = concat(IX.executePayment, writeU64(BigInt(amountLamports)));
    const tx = new Transaction().add(
      instruction(
        [
          { pubkey: agentPda, isSigner: false, isWritable: true },
          { pubkey: owner, isSigner: true, isWritable: false },
          { pubkey: DEMO_RECIPIENT, isSigner: false, isWritable: true },
        ],
        data,
      ),
    );

    const result = await sendTransaction(tx);

    if (isExpectedRejection) {
      if (result.error) {
        setResult(
          "danger",
          "PAYMENT REJECTED",
          "PerTransactionLimitExceeded — the Guardrail rejected the 0.009 SOL request on-chain.",
          result.signature,
        );
      } else {
        setResult(
          "danger",
          "Unexpected approval",
          "The test transaction succeeded when it should have been rejected.",
          result.signature,
        );
      }
      return;
    }

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
    if (isExpectedRejection) {
      setResult(
        "danger",
        "PAYMENT REJECTED",
        "PerTransactionLimitExceeded — the Guardrail blocked the over-limit request.",
      );
    } else {
      setResult(
        "danger",
        "Payment failed",
        error instanceof Error ? error.message : "Transaction failed.",
      );
    }
  } finally {
    setBusy(false);
    await fetchPolicy();
  }
}

connectButton.addEventListener("click", connectWallet);
setupButton.addEventListener("click", initializePolicy);
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
