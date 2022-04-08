use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod karma {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }

    pub fn create(ctx: Context<Create>, authority: Pubkey) -> Result<()> {
        let karma = &mut ctx.accounts.karma;
        karma.authority = authority;
        karma.balance = 0;
        karma.sunrise = Clock::get().unwrap().unix_timestamp;
        karma.energy = ENERGY_PER_SUNRISE;

        Ok(())
    }

    pub fn good(ctx: Context<Interaction>) -> Result<()> {
        register_interaction(
            1,
            &mut ctx.accounts.reported,
            &mut ctx.accounts.reporter,
        );

        Ok(())
    }

    pub fn bad(ctx: Context<Interaction>) -> Result<()> {
        register_interaction(
            -1,
            &mut ctx.accounts.reported,
            &mut ctx.accounts.reporter,
        );

        Ok(())
    }

    pub fn sunrise(ctx: Context<Sunrise>) -> Result<()> {
        let karma = &mut ctx.accounts.karma;

        if seconds_since_last_sunrise(karma.sunrise) < SECONDS_PER_DAY {
            // Sunrise not possible until 24h since last one
            return Ok(());
        }

        karma.sunrise = Clock::get().unwrap().unix_timestamp;
        karma.energy = ENERGY_PER_SUNRISE;

        Ok(())
    }
}

fn seconds_since_last_sunrise(last_sunrise: i64) -> i64 {
    return Clock::get().unwrap().unix_timestamp - last_sunrise;
}

// interactions affect both sides in the same way
fn register_interaction(
    value: i64,
    reported: &mut Karma,
    reporter: &mut Karma,
) {
    if reporter.energy <= 0 {
        return;
    }

    if seconds_since_last_sunrise(reporter.sunrise) > SECONDS_PER_DAY {
        // Sunrise is required prior to any active interactions
        return;
    }

    reporter.energy -= ENERGY_PER_INTERACTION;

    reported.balance += value;
    reporter.balance += value;
}

#[derive(Accounts)]
pub struct Initialize {}

#[derive(Accounts)]
pub struct Create<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Karma::DATA_SIZE,
    )]
    pub karma: Account<'info, Karma>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Interaction<'info> {
    #[account(
        mut,
    )]
    pub reported: Account<'info, Karma>,

    #[account(
        mut,
        signer,
    )]
    pub reporter: Account<'info, Karma>,
}

const ENERGY_PER_SUNRISE: u16 = 2400;
const ENERGY_PER_INTERACTION: u16 = 100;
const SECONDS_PER_DAY: i64 = 86400;

#[account]
pub struct Karma {         // 50 bytes total
    pub authority: Pubkey, // 32 bytes
    pub balance: i64,      // 8 bytes
    pub energy: u16,       // 2 bytes
    pub sunrise: i64,      // 8 bytes
}

impl Karma {
    const DATA_SIZE: usize = 50;
}

#[derive(Accounts)]
pub struct Sunrise<'info> {
    #[account(
        mut,
        signer,
    )]
    pub karma: Account<'info, Karma>,
}
