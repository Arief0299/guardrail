use anchor_lang::prelude::*;

declare_id!("HP8ptgh4CDEwgR7rSESkfR4ZxyrLcg5VfkossDLwU5RS");

const AGENT_SEED: &[u8] = b"agent";
const DAY_SECONDS: i64 = 86_400;

#[program]
pub mod guardrail {
    use super::*;

    pub fn initialize_agent(
        ctx: Context<InitializeAgent>,
        agent_authority: Pubkey,
        max_per_transaction: u64,
        daily_limit: u64,
        allowed_recipient: Pubkey,
        expiry: i64,
    ) -> Result<()> {
        require!(
            max_per_transaction > 0,
            GuardrailError::InvalidTransactionLimit
        );

        require!(
            daily_limit >= max_per_transaction,
            GuardrailError::InvalidDailyLimit
        );

        require!(
            expiry > Clock::get()?.unix_timestamp,
            GuardrailError::InvalidExpiry
        );

        let agent = &mut ctx.accounts.agent;

        agent.owner = ctx.accounts.owner.key();
        agent.agent_authority = agent_authority;
        agent.max_per_transaction = max_per_transaction;
        agent.daily_limit = daily_limit;
        agent.spent_today = 0;
        agent.day_start = Clock::get()?.unix_timestamp;
        agent.allowed_recipient = allowed_recipient;
        agent.expiry = expiry;
        agent.paused = false;
        agent.bump = ctx.bumps.agent;

        Ok(())
    }

    pub fn update_policy(
        ctx: Context<UpdatePolicy>,
        max_per_transaction: u64,
        daily_limit: u64,
        allowed_recipient: Pubkey,
        expiry: i64,
    ) -> Result<()> {
        require!(
            max_per_transaction > 0,
            GuardrailError::InvalidTransactionLimit
        );

        require!(
            daily_limit >= max_per_transaction,
            GuardrailError::InvalidDailyLimit
        );

        require!(
            expiry > Clock::get()?.unix_timestamp,
            GuardrailError::InvalidExpiry
        );

        let agent = &mut ctx.accounts.agent;

        agent.max_per_transaction = max_per_transaction;
        agent.daily_limit = daily_limit;
        agent.allowed_recipient = allowed_recipient;
        agent.expiry = expiry;

        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, GuardrailError::InvalidAmount);

        let transfer = anchor_lang::system_program::Transfer {
            from: ctx.accounts.owner.to_account_info(),
            to: ctx.accounts.agent.to_account_info(),
        };

        anchor_lang::system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.key(), transfer),
            amount,
        )?;

        Ok(())
    }

    pub fn execute_payment(ctx: Context<ExecutePayment>, amount: u64) -> Result<()> {
        require!(amount > 0, GuardrailError::InvalidAmount);

        let agent = &mut ctx.accounts.agent;
        let now = Clock::get()?.unix_timestamp;

        require!(!agent.paused, GuardrailError::AgentPaused);
        require!(now <= agent.expiry, GuardrailError::PolicyExpired);

        require!(
            ctx.accounts.agent_authority.key() == agent.agent_authority,
            GuardrailError::UnauthorizedAgent
        );

        require!(
            ctx.accounts.recipient.key() == agent.allowed_recipient,
            GuardrailError::RecipientNotAllowed
        );

        require!(
            amount <= agent.max_per_transaction,
            GuardrailError::PerTransactionLimitExceeded
        );

        if now.saturating_sub(agent.day_start) >= DAY_SECONDS {
            agent.day_start = now;
            agent.spent_today = 0;
        }

        let new_daily_total = agent
            .spent_today
            .checked_add(amount)
            .ok_or(GuardrailError::DailyLimitExceeded)?;

        require!(
            new_daily_total <= agent.daily_limit,
            GuardrailError::DailyLimitExceeded
        );

        let rent_reserve = Rent::get()?.minimum_balance(Agent::INIT_SPACE);

        let available = agent
            .to_account_info()
            .lamports()
            .saturating_sub(rent_reserve);

        require!(
            amount <= available,
            GuardrailError::InsufficientVaultBalance
        );

        **agent.to_account_info().try_borrow_mut_lamports()? -= amount;

        **ctx
            .accounts
            .recipient
            .to_account_info()
            .try_borrow_mut_lamports()? += amount;

        agent.spent_today = new_daily_total;

        emit!(PaymentExecuted {
            agent: agent.key(),
            recipient: ctx.accounts.recipient.key(),
            amount,
            timestamp: now,
        });

        Ok(())
    }

    pub fn pause_agent(ctx: Context<UpdateAgentStatus>) -> Result<()> {
        ctx.accounts.agent.paused = true;
        Ok(())
    }

    pub fn resume_agent(ctx: Context<UpdateAgentStatus>) -> Result<()> {
        ctx.accounts.agent.paused = false;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeAgent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + Agent::INIT_SPACE,
        seeds = [AGENT_SEED, owner.key().as_ref()],
        bump
    )]
    pub agent: Account<'info, Agent>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePolicy<'info> {
    #[account(
        mut,
        has_one = owner @ GuardrailError::UnauthorizedOwner
    )]
    pub agent: Account<'info, Agent>,

    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        has_one = owner @ GuardrailError::UnauthorizedOwner
    )]
    pub agent: Account<'info, Agent>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecutePayment<'info> {
    #[account(mut)]
    pub agent: Account<'info, Agent>,

    pub agent_authority: Signer<'info>,

    #[account(mut)]
    pub recipient: SystemAccount<'info>,
}

#[derive(Accounts)]
pub struct UpdateAgentStatus<'info> {
    #[account(
        mut,
        has_one = owner @ GuardrailError::UnauthorizedOwner
    )]
    pub agent: Account<'info, Agent>,

    pub owner: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Agent {
    pub owner: Pubkey,
    pub agent_authority: Pubkey,
    pub max_per_transaction: u64,
    pub daily_limit: u64,
    pub spent_today: u64,
    pub day_start: i64,
    pub allowed_recipient: Pubkey,
    pub expiry: i64,
    pub paused: bool,
    pub bump: u8,
}

#[event]
pub struct PaymentExecuted {
    pub agent: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum GuardrailError {
    #[msg("Only the agent owner can perform this action")]
    UnauthorizedOwner,

    #[msg("Unauthorized agent authority")]
    UnauthorizedAgent,

    #[msg("Transaction amount must be greater than zero")]
    InvalidAmount,

    #[msg("Invalid per-transaction limit")]
    InvalidTransactionLimit,

    #[msg("Daily limit must be greater than or equal to the transaction limit")]
    InvalidDailyLimit,

    #[msg("Policy expiry must be in the future")]
    InvalidExpiry,

    #[msg("The agent is paused")]
    AgentPaused,

    #[msg("The policy has expired")]
    PolicyExpired,

    #[msg("Recipient is not allowed by policy")]
    RecipientNotAllowed,

    #[msg("Per-transaction spending limit exceeded")]
    PerTransactionLimitExceeded,

    #[msg("Daily spending limit exceeded")]
    DailyLimitExceeded,

    #[msg("Insufficient vault balance")]
    InsufficientVaultBalance,
}
