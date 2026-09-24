use std::rc::Rc;

use anchor_client::{Client, Cluster, Program, Signer};
use anchor_lang::prelude::Pubkey;
use anchor_lang::system_program;
use anchor_lang::Key;
use solana_keypair::Keypair;

use guardrail::{accounts, instruction};

const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

#[test]
fn guardrail_policy_enforcement() {
    let owner = Keypair::new();
    let agent_authority = Keypair::new();
    let allowed_recipient = Keypair::new();
    let blocked_recipient = Keypair::new();

    let client = Client::new(Cluster::Localnet, Rc::new(owner));

    let program = client
        .program(guardrail::ID)
        .expect("failed to create Guardrail program client");

    let owner_pubkey = program.payer().key();

    // Fund owner and test accounts.
    let signature = program
        .rpc()
        .request_airdrop(&owner_pubkey, 100 * LAMPORTS_PER_SOL)
        .expect("failed to request owner airdrop");

    program
        .rpc()
        .confirm_transaction(&signature)
        .expect("failed to confirm owner airdrop");

    let signature = program
        .rpc()
        .request_airdrop(&agent_authority.pubkey(), 10 * LAMPORTS_PER_SOL)
        .expect("failed to request agent authority airdrop");

    program
        .rpc()
        .confirm_transaction(&signature)
        .expect("failed to confirm agent authority airdrop");

    let signature = program
        .rpc()
        .request_airdrop(&allowed_recipient.pubkey(), LAMPORTS_PER_SOL)
        .expect("failed to request recipient airdrop");

    program
        .rpc()
        .confirm_transaction(&signature)
        .expect("failed to confirm recipient airdrop");

    let signature = program
        .rpc()
        .request_airdrop(&blocked_recipient.pubkey(), LAMPORTS_PER_SOL)
        .expect("failed to request blocked recipient airdrop");

    program
        .rpc()
        .confirm_transaction(&signature)
        .expect("failed to confirm blocked recipient airdrop");

    let (agent_pda, _) =
        Pubkey::find_program_address(&[b"agent", owner_pubkey.as_ref()], &guardrail::ID);

    let expiry = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("system clock error")
        .as_secs() as i64
        + 86_400;

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
        .signer(&agent_authority)
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
        .signer(&agent_authority)
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
        .signer(&agent_authority)
        .send();

    assert!(result.is_err());
    println!("PASS: per-transaction limit enforced");

    println!("=== BLOCK UNAUTHORIZED AGENT ===");

    let fake_authority = Keypair::new();

    let signature = program
        .rpc()
        .request_airdrop(&fake_authority.pubkey(), 2 * LAMPORTS_PER_SOL)
        .expect("failed to request fake authority airdrop");

    program
        .rpc()
        .confirm_transaction(&signature)
        .expect("failed to confirm fake authority airdrop");

    let result = program
        .request()
        .accounts(accounts::ExecutePayment {
            agent: agent_pda,
            agent_authority: fake_authority.pubkey(),
            recipient: allowed_recipient.pubkey(),
        })
        .args(instruction::ExecutePayment {
            amount: 100_000_000,
        })
        .signer(&fake_authority)
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
        .signer(&agent_authority)
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
        .signer(&agent_authority)
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
        .signer(&agent_authority)
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

    println!("======================================");
    println!("ALL GUARDRAIL TESTS PASSED");
    println!("======================================");
}
