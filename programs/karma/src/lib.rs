use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod karma {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }

    pub fn create(ctx: Context<Create>, authority: Pubkey) -> Result<()> {
        let soul = &mut ctx.accounts.soul;
        soul.authority = authority;
        soul.sunrise = Clock::get().unwrap().unix_timestamp;
        soul.energy = ENERGY_PER_SUNRISE;

        Ok(())
    }

    pub fn praise(ctx: Context<Interaction>) -> Result<()> {
        register_interaction(
            1,
            &mut ctx.accounts.another_soul,
            &mut ctx.accounts.soul,
        );

        Ok(())
    }

    pub fn accuse(ctx: Context<Interaction>) -> Result<()> {
        register_interaction(
            -1,
            &mut ctx.accounts.another_soul,
            &mut ctx.accounts.soul,
        );

        Ok(())
    }

    pub fn sunrise(ctx: Context<Sunrise>) -> Result<()> {
        let soul = &mut ctx.accounts.soul;

        if seconds_since_last_sunrise(soul.sunrise) < SECONDS_PER_DAY {
            // Sunrise not possible until 24h since last one
            return Ok(());
        }

        soul.sunrise = Clock::get().unwrap().unix_timestamp;
        soul.energy = ENERGY_PER_SUNRISE;

        Ok(())
    }
}

fn seconds_since_last_sunrise(last_sunrise: i64) -> i64 {
    return Clock::get().unwrap().unix_timestamp - last_sunrise;
}

// interactions affect both sides in the same way,
// but only active soul's energy is consumed.
fn register_interaction(
    value: i64,
    another_soul: &mut Soul,
    soul: &mut Soul,
) {
    if soul.energy <= 0 {
        return;
    }

    if seconds_since_last_sunrise(soul.sunrise) > SECONDS_PER_DAY {
        // Sunrise is required prior to any active interactions
        return;
    }

    soul.energy -= ENERGY_PER_INTERACTION;

    another_soul.karma += value;
    soul.karma += value;
}

#[derive(Accounts)]
pub struct Initialize {}

#[derive(Accounts)]
pub struct Create<'info> {
    #[account(
        init,
        payer = authority,
    )]
    pub soul: Account<'info, Soul>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Interaction<'info> {
    #[account(
        mut,
    )]
    pub another_soul: Account<'info, Soul>,

    #[account(
        mut,
        signer,
    )]
    pub soul: Account<'info, Soul>,
}

const ENERGY_PER_SUNRISE: u16 = 2400;
const ENERGY_PER_INTERACTION: u16 = 100;
const SECONDS_PER_DAY: i64 = 86400;

#[account]
#[derive(Default)]
pub struct Soul {
    pub authority: Pubkey,
    pub karma: i64,
    pub energy: u16,
    pub sunrise: i64,
}

#[derive(Accounts)]
pub struct Sunrise<'info> {
    #[account(
        mut,
        signer,
    )]
    pub soul: Account<'info, Soul>,
}
