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
}

// interactions affect both sides in the same way
fn register_interaction(
    value: i64,
    one_karma: &mut Karma,
    another_one: &mut Karma,
) {
    one_karma.balance += value;
    another_one.balance += value;
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

#[account]
pub struct Karma {
    pub balance: i64,       // 8 bytes
    pub authority: Pubkey,  // 32 bytes
}

impl Karma {
    const DATA_SIZE: usize = 40;
}
