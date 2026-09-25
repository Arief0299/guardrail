use std::rc::Rc;
use std::thread;
use std::time::Duration;

use anchor_client::{Client, Cluster, Signer};
use anchor_lang::system_program;
use anchor_lang::{prelude::system_instruction, prelude::Pubkey, Key};
use solana_keypair::{read_keypair_file, Keypair};

use guardrail::{accounts, instruction, ID};

const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

#[test]
fn guardrail_policy_enforcement() {
    let payer = read_keypair_file("/home/arief/.config/solana/id.json")
        .expect("failed to load payer keypair");

    let agent_authority = Rc::new(Keypair::new());
    let allowed_recipient = Rc::new(Keypair::new());
    let blocked_recipient = Rc::new(Keypair::new());
    let unauthorized_agent = Rc::new(Keypair::new());
    let unauthorized_owner = Rc::new(Keypair::new());

    let client = Client::new(
        Cluster::Custom(
            "http://127.0.0.1:8899".to_string(),
            "ws://127.0.0.1:8900".to_string(),
        ),
        Rc::new(payer),
    );

    let program = client
        .program(ID)
        .expect("failed to create Guardrail program client");

    let owner = program.payer();
    let owner_pubkey = owner.key();

    let (agent_pda, _) = Pubkey::find_program_address(&[b"agent", owner_pubkey.as_ref()], &ID);

    let expiry = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("system clock error")
        .as_secs() as i64
        + 86_400;

    println!("=== FUND TEST ACCOUNTS ===");

    for keypair in [
        &agent_authority,
        &allowed_recipient,
        &blocked_recipient,
        &unauthorized_agent,
        &unauthorized_owner,
    ] {
        let signature = program
            .rpc()
            .request_airdrop(&keypair.pubkey(), 10 * LAMPORTS_PER_SOL)
            .expect("airdrop failed");

        program
            .rpc()
            .confirm_transaction(&signature)
            .expect("airdrop confirmation failed");
    }

    println!("PASS: test accounts funded");

    println!("=== INITIALIZE AGENT ===");

    program
        .request()
        .accounts(accounts::InitializeAgent {
            owner: owner_pubkey,
            agent: agent_pda,
            system_program: system_program::ID,
        })
        .args(instruction::InitializeAgent {
            agent_authority: agent_authority.pubkey(),
            max_per_transaction: LAMPORTS_PER_SOL,
            daily_limit: 2 * LAMPORTS_PER_SOL,
            allowed_recipient: allowed_recipient.pubkey(),
            expiry,
        })
        .send()
        .expect("initialize_agent failed");

    println!("PASS: initialize_agent");

    println!("=== DEPOSIT ===");

    program
        .request()
        .accounts(accounts::Deposit {
            agent: agent_pda,
            owner: owner_pubkey,
            system_program: system_program::ID,
        })
        .args(instruction::Deposit {
            amount: 5 * LAMPORTS_PER_SOL,
        })
        .send()
        .expect("deposit failed");

    println!("PASS: deposit 5 SOL");

    println!("=== VALID PAYMENT ===");

    program
        .request()
        .accounts(accounts::ExecutePayment {
            agent: agent_pda,
            agent_authority: agent_authority.pubkey(),
            recipient: allowed_recipient.pubkey(),
        })
        .args(instruction::ExecutePayment {
            amount: LAMPORTS_PER_SOL,
        })
        .signer(&*agent_authority)
        .send()
        .expect("valid payment failed");

    println!("PASS: valid payment");

    println!("=== BLOCK WRONG RECIPIENT ===");

    let result = program
        .request()
        .accounts(accounts::ExecutePayment {
            agent: agent_pda,
            agent_authority: agent_authority.pubkey(),
            recipient: blocked_recipient.pubkey(),
        })
        .args(instruction::ExecutePayment {
            amount: 100_000_000,
        })
        .signer(&*agent_authority)
        .send();

    assert!(result.is_err());
    println!("PASS: blocked recipient rejected");

    println!("=== BLOCK PER-TRANSACTION LIMIT ===");

    let result = program
        .request()
        .accounts(accounts::ExecutePayment {
            agent: agent_pda,
            agent_authority: agent_authority.pubkey(),
            recipient: allowed_recipient.pubkey(),
        })
        .args(instruction::ExecutePayment {
            amount: 2 * LAMPORTS_PER_SOL,
        })
        .signer(&*agent_authority)
        .send();

    assert!(result.is_err());
    println!("PASS: per-transaction limit enforced");

    println!("=== BLOCK UNAUTHORIZED AGENT ===");

    let result = program
        .request()
        .accounts(accounts::ExecutePayment {
            agent: agent_pda,
            agent_authority: unauthorized_agent.pubkey(),
            recipient: allowed_recipient.pubkey(),
        })
        .args(instruction::ExecutePayment {
            amount: 100_000_000,
        })
        .signer(&*unauthorized_agent)
        .send();

    assert!(result.is_err());
    println!("PASS: unauthorized agent rejected");

    println!("=== BLOCK DAILY LIMIT ===");

    program
        .request()
        .accounts(accounts::ExecutePayment {
            agent: agent_pda,
            agent_authority: agent_authority.pubkey(),
            recipient: allowed_recipient.pubkey(),
        })
        .args(instruction::ExecutePayment {
            amount: LAMPORTS_PER_SOL,
        })
        .signer(&*agent_authority)
        .send()
        .expect("second payment failed");

    println!("PASS: second payment within daily limit");

    let result = program
        .request()
        .accounts(accounts::ExecutePayment {
            agent: agent_pda,
            agent_authority: agent_authority.pubkey(),
            recipient: allowed_recipient.pubkey(),
        })
        .args(instruction::ExecutePayment {
            amount: 100_000_000,
        })
        .signer(&*agent_authority)
        .send();

    assert!(result.is_err());
    println!("PASS: daily limit enforced");

    println!("=== PAUSE AGENT ===");

    program
        .request()
        .accounts(accounts::UpdateAgentStatus {
            agent: agent_pda,
            owner: owner_pubkey,
        })
        .args(instruction::PauseAgent {})
        .send()
        .expect("pause_agent failed");

    println!("PASS: pause_agent");

    let result = program
        .request()
        .accounts(accounts::ExecutePayment {
            agent: agent_pda,
            agent_authority: agent_authority.pubkey(),
            recipient: allowed_recipient.pubkey(),
        })
        .args(instruction::ExecutePayment {
            amount: 100_000_000,
        })
        .signer(&*agent_authority)
        .send();

    assert!(result.is_err());
    println!("PASS: paused agent rejects payment");

    println!("=== RESUME AGENT ===");

    program
        .request()
        .accounts(accounts::UpdateAgentStatus {
            agent: agent_pda,
            owner: owner_pubkey,
        })
        .args(instruction::ResumeAgent {})
        .send()
        .expect("resume_agent failed");

    println!("PASS: resume_agent");

    println!("=== UNAUTHORIZED OWNER CHECK ===");

    let result = program
        .request()
        .accounts(accounts::UpdateAgentStatus {
            agent: agent_pda,
            owner: unauthorized_owner.pubkey(),
        })
        .args(instruction::PauseAgent {})
        .signer(&*unauthorized_owner)
        .send();

    assert!(result.is_err());
    println!("PASS: unauthorized owner rejected");

    println!("=== EXPIRED POLICY CHECK ===");

    let expired_agent_authority = Rc::new(Keypair::new());

    let signature = program
        .rpc()
        .request_airdrop(&expired_agent_authority.pubkey(), 2 * LAMPORTS_PER_SOL)
        .expect("expired agent authority airdrop failed");

    program
        .rpc()
        .confirm_transaction(&signature)
        .expect("expired agent authority airdrop confirmation failed");

    let (expired_agent_pda, _) =
        Pubkey::find_program_address(&[b"agent", unauthorized_owner.pubkey().as_ref()], &ID);

    let short_expiry = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("system clock error")
        .as_secs() as i64
        + 2;

    program
        .request()
        .accounts(accounts::InitializeAgent {
            owner: unauthorized_owner.pubkey(),
            agent: expired_agent_pda,
            system_program: system_program::ID,
        })
        .args(instruction::InitializeAgent {
            agent_authority: expired_agent_authority.pubkey(),
            max_per_transaction: LAMPORTS_PER_SOL,
            daily_limit: LAMPORTS_PER_SOL,
            allowed_recipient: allowed_recipient.pubkey(),
            expiry: short_expiry,
        })
        .signer(&*unauthorized_owner)
        .send()
        .expect("short-lived agent initialization failed");

    println!("PASS: short-lived policy initialized");

    println!("Waiting for policy to expire...");
    thread::sleep(Duration::from_secs(3));

    let result = program
        .request()
        .accounts(accounts::ExecutePayment {
            agent: expired_agent_pda,
            agent_authority: expired_agent_authority.pubkey(),
            recipient: allowed_recipient.pubkey(),
        })
        .args(instruction::ExecutePayment {
            amount: 100_000_000,
        })
        .signer(&*expired_agent_authority)
        .send();

    assert!(result.is_err());
    println!("PASS: expired policy rejected");

    println!("=== INVALID POLICY CONFIGURATION CHECK ===");

    let invalid_owner = Rc::new(Keypair::new());
    let invalid_agent_authority = Rc::new(Keypair::new());

    for keypair in [&invalid_owner, &invalid_agent_authority] {
        let signature = program
            .rpc()
            .request_airdrop(&keypair.pubkey(), 2 * LAMPORTS_PER_SOL)
            .expect("invalid policy test airdrop failed");

        program
            .rpc()
            .confirm_transaction(&signature)
            .expect("invalid policy test airdrop confirmation failed");
    }

    // Case 1: max_per_transaction = 0
    let (zero_max_pda, _) =
        Pubkey::find_program_address(&[b"agent", invalid_owner.pubkey().as_ref()], &ID);

    let result = program
        .request()
        .accounts(accounts::InitializeAgent {
            owner: invalid_owner.pubkey(),
            agent: zero_max_pda,
            system_program: system_program::ID,
        })
        .args(instruction::InitializeAgent {
            agent_authority: invalid_agent_authority.pubkey(),
            max_per_transaction: 0,
            daily_limit: LAMPORTS_PER_SOL,
            allowed_recipient: allowed_recipient.pubkey(),
            expiry,
        })
        .signer(&*invalid_owner)
        .send();

    assert!(result.is_err());
    println!("PASS: zero transaction limit rejected");

    // Case 2: daily_limit < max_per_transaction
    let (invalid_daily_pda, _) =
        Pubkey::find_program_address(&[b"agent", invalid_owner.pubkey().as_ref()], &ID);

    let result = program
        .request()
        .accounts(accounts::InitializeAgent {
            owner: invalid_owner.pubkey(),
            agent: invalid_daily_pda,
            system_program: system_program::ID,
        })
        .args(instruction::InitializeAgent {
            agent_authority: invalid_agent_authority.pubkey(),
            max_per_transaction: 2 * LAMPORTS_PER_SOL,
            daily_limit: LAMPORTS_PER_SOL,
            allowed_recipient: allowed_recipient.pubkey(),
            expiry,
        })
        .signer(&*invalid_owner)
        .send();

    assert!(result.is_err());
    println!("PASS: daily limit below transaction limit rejected");

    // Case 3: expiry already in the past
    let (expired_config_pda, _) =
        Pubkey::find_program_address(&[b"agent", invalid_agent_authority.pubkey().as_ref()], &ID);

    let past_expiry = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("system clock error")
        .as_secs() as i64
        - 1;

    let result = program
        .request()
        .accounts(accounts::InitializeAgent {
            owner: invalid_agent_authority.pubkey(),
            agent: expired_config_pda,
            system_program: system_program::ID,
        })
        .args(instruction::InitializeAgent {
            agent_authority: invalid_agent_authority.pubkey(),
            max_per_transaction: LAMPORTS_PER_SOL,
            daily_limit: LAMPORTS_PER_SOL,
            allowed_recipient: allowed_recipient.pubkey(),
            expiry: past_expiry,
        })
        .signer(&*invalid_agent_authority)
        .send();

    assert!(result.is_err());
    println!("PASS: already-expired policy rejected");

    println!("=== INSUFFICIENT VAULT BALANCE CHECK ===");

    let balance_owner = Rc::new(Keypair::new());
    let balance_agent_authority = Rc::new(Keypair::new());
    let balance_recipient = Rc::new(Keypair::new());

    // Fund the balance-test owner directly from the test payer.
    let payer_pubkey = program.payer().key();

    let transfer_ix = system_instruction::transfer(
        &payer_pubkey,
        &balance_owner.pubkey(),
        10 * LAMPORTS_PER_SOL,
    );

    program
        .request()
        .instruction(transfer_ix)
        .send()
        .expect("balance test owner funding failed");

    let owner_balance = program
        .rpc()
        .get_balance(&balance_owner.pubkey())
        .expect("balance test owner balance lookup failed");

    println!("Balance test owner: {} lamports", owner_balance);

    assert!(
        owner_balance >= 2 * LAMPORTS_PER_SOL,
        "balance test owner was not funded: {} lamports",
        owner_balance
    );

    let (balance_agent_pda, _) =
        Pubkey::find_program_address(&[b"agent", balance_owner.pubkey().as_ref()], &ID);

    let balance_expiry = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("system clock error")
        .as_secs() as i64
        + 86_400;

    // Initialize a separate agent for the insufficient-balance test.
    program
        .request()
        .accounts(accounts::InitializeAgent {
            owner: balance_owner.pubkey(),
            agent: balance_agent_pda,
            system_program: system_program::ID,
        })
        .args(instruction::InitializeAgent {
            agent_authority: balance_agent_authority.pubkey(),
            max_per_transaction: LAMPORTS_PER_SOL,
            daily_limit: LAMPORTS_PER_SOL,
            allowed_recipient: balance_recipient.pubkey(),
            expiry: balance_expiry,
        })
        .signer(&*balance_owner)
        .send()
        .expect("balance test initialize failed");

    println!("PASS: balance test agent initialized");

    // Deposit only 0.5 SOL into the vault.
    program
        .request()
        .accounts(accounts::Deposit {
            agent: balance_agent_pda,
            owner: balance_owner.pubkey(),
            system_program: system_program::ID,
        })
        .args(instruction::Deposit {
            amount: LAMPORTS_PER_SOL / 2,
        })
        .signer(&*balance_owner)
        .send()
        .expect("balance test deposit failed");

    println!("PASS: 0.5 SOL deposited");

    // Request 1 SOL.
    // The policy permits up to 1 SOL, but the vault contains only 0.5 SOL.
    // The program must reject the payment because the vault cannot cover it
    // while preserving the rent-exempt reserve.
    let result = program
        .request()
        .accounts(accounts::ExecutePayment {
            agent: balance_agent_pda,
            agent_authority: balance_agent_authority.pubkey(),
            recipient: balance_recipient.pubkey(),
        })
        .args(instruction::ExecutePayment {
            amount: LAMPORTS_PER_SOL,
        })
        .signer(&*balance_agent_authority)
        .send();

    assert!(
        result.is_err(),
        "payment should fail when vault balance is insufficient"
    );

    println!("PASS: insufficient vault balance rejected");

    println!("======================================");
    println!("ALL GUARDRAIL TESTS PASSED");
    println!("======================================");
}
