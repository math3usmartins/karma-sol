import * as anchor from "@project-serum/anchor";
const { SystemProgram } = anchor.web3;

import { Program } from "@project-serum/anchor";
import { Karma } from "../target/types/karma";

import assert from "assert";

const program = anchor.workspace.Karma as Program<Karma>;
const provider = anchor.Provider.local();

// Configure the client to use the local cluster.
anchor.setProvider(anchor.Provider.env());

describe("karma", () => {
  it("Is initialized!", async () => {
    const tx = await program.rpc.initialize({});
    console.log("Your transaction signature", tx);
  });

  it("creates neutral karma", async () => {
    const soul = anchor.web3.Keypair.generate();

    await create(soul);

    let createdKarma = await program.account.soul.fetch(soul.publicKey);

    assert.ok(createdKarma.authority.equals(provider.wallet.publicKey));
    assert.equal(createdKarma.karma.toNumber(), 0);
    assert.equal(createdKarma.energy, 2400);
    assert.equal(createdKarma.sunrise.toNumber() > 0, true);
  });

  it("ignores sunrise ahead of time", async () => {
    const soul = anchor.web3.Keypair.generate();
    const anotherSoul = anchor.web3.Keypair.generate();

    await Promise.all([
      create(anotherSoul),
      create(soul),
    ]);

    let accounts = await Promise.all([
      program.account.soul.fetch(anotherSoul.publicKey),
      program.account.soul.fetch(soul.publicKey),
    ]);

    const initialSunrise = accounts[1].sunrise.toNumber();

    assert.equal(accounts[1].energy, 2400);

    await praise(anotherSoul, soul);

    accounts = await Promise.all([
      program.account.soul.fetch(anotherSoul.publicKey),
      program.account.soul.fetch(soul.publicKey),
    ]);

    assert.equal(accounts[1].energy, 2300);

    await program.rpc.sunrise({
      accounts: {
        soul: soul.publicKey,
      },
      signers: [soul],
    });

    await program.account.soul.fetch(soul.publicKey).then(
      account => {
        // sunrise MUST NOT have changed!
        assert.equal(account.sunrise.toNumber(), initialSunrise);
        // energy MUST NOT have changed either
        assert.equal(account.energy, 2300);
      }
    )
  });

  it("requires valid signer to create karma", async () => {
    const soul = anchor.web3.Keypair.generate();
    const anotherSoul = anchor.web3.Keypair.generate();

    await program.rpc.create(provider.wallet.publicKey, {
      accounts: {
        soul: soul.publicKey,
        authority: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      },
      signers: [anotherSoul],
    }).then(() => {
      assert.fail('ERR: this was expected to fail!');
    }).catch(() => {
      // ok, it failed as expected.
    });
  });

  it("counts good interaction", async () => {
    const soul = anchor.web3.Keypair.generate();
    const anotherSoul = anchor.web3.Keypair.generate();

    await Promise.all([
      create(anotherSoul),
      create(soul),
    ]);

    await praise(anotherSoul, soul);

    const accounts = await Promise.all([
      program.account.soul.fetch(anotherSoul.publicKey),
      program.account.soul.fetch(soul.publicKey),
    ]);

    assert.equal(accounts[0].karma.toNumber(), 1);
    assert.equal(accounts[1].karma.toNumber(), 1);

    // active interaction MUST consume some energy: -100 joules
    assert.equal(accounts[1].energy.valueOf(), 2300);

    // passive interaction MUST NOT consume any energy.
    assert.equal(accounts[0].energy.valueOf(), 2400);
  });

  it("counts bad interaction", async () => {
    const soul = anchor.web3.Keypair.generate();
    const anotherSoul = anchor.web3.Keypair.generate();

    await Promise.all([
      create(anotherSoul),
      create(soul),
    ]);

    await accuse(anotherSoul, soul);

    const accounts = await Promise.all([
      program.account.soul.fetch(anotherSoul.publicKey),
      program.account.soul.fetch(soul.publicKey),
    ]);

    assert.equal(accounts[0].karma.toNumber(), -1);
    assert.equal(accounts[1].karma.toNumber(), -1);
  });

  it("accumulates interactions", async () => {
    const soul = anchor.web3.Keypair.generate();
    const anotherSoul = anchor.web3.Keypair.generate();
    const yetAnotherSoul = anchor.web3.Keypair.generate();

    await Promise.all([
      create(anotherSoul),
      create(soul),
      create(yetAnotherSoul),
    ]);

    await Promise.all([
      praise(anotherSoul, soul),
      praise(yetAnotherSoul, soul),
    ]);

    const accounts = await Promise.all([
      program.account.soul.fetch(anotherSoul.publicKey),
      program.account.soul.fetch(yetAnotherSoul.publicKey),
      program.account.soul.fetch(soul.publicKey),
    ]);

    assert.equal(accounts[0].karma.toNumber(), 1);
    assert.equal(accounts[1].karma.toNumber(), 1);

    // this one had two good interactions
    assert.equal(accounts[2].karma.toNumber(), 2);

    // active interaction MUST consume some energy: 2400 - 200 = 2200
    assert.equal(accounts[2].energy.valueOf(), 2200);
  });

  it("ignores interaction when energy is not sufficient", async () => {
    const soul = anchor.web3.Keypair.generate();
    const otherSouls = Array.from(Array(24)).map(() => anchor.web3.Keypair.generate());

    await Promise.all(
      otherSouls.concat([soul]).map(soul => create(soul))
    );

    await Promise.all(
      otherSouls.map(
        anotherSoul => program.account.soul.fetch(anotherSoul.publicKey).then(
          account => {
            // accounts created with zeroed balance and 2400 joules
            assert.equal(account.karma.toNumber(), 0);
            assert.equal(account.energy, 2400);
          }
        )
      )
    );

    await Promise.all(
      otherSouls.map(anotherSoul => praise(anotherSoul, soul))
    );

    await Promise.all(
      otherSouls.map(
        anotherSoul => program.account.soul.fetch(anotherSoul.publicKey)
          .then(account => {
            // other accounts balance MUST have changed
            assert.equal(account.karma.toNumber(), 1);
            // ... but their energy MUST NOT have changed, because they were in passive mode.
            assert.equal(account.energy, 2400);
          })
      )
    );

    await program.account.soul.fetch(soul.publicKey).then(
      account => {
        // active karma's energy MUST be empty now after 24 active interactions.
        assert.equal(account.energy, 0);
      }
    )

    // ... and another interaction MUST NOT cause any changes
    await praise(otherSouls[0], soul)

    await Promise.all([
      program.account.soul.fetch(otherSouls[0].publicKey).then(
        account => {
          // passive karma's energy MUST NOT change
          assert.equal(account.energy, 2400);

          // balance MUST NOT change either, because interaction MUST have been ignored.
          assert.equal(account.karma.toNumber(), 1);
        }
      ),
      program.account.soul.fetch(soul.publicKey).then(
        account => {
          // energy and balance MUST NOT change...
          assert.equal(account.energy, 0);
          assert.equal(account.karma.toNumber(), 24);
        }
      )
    ]);
  });

  it("requires valid signature to praise another soul", async () => {
    const anotherSoul = anchor.web3.Keypair.generate();
    const soul = anchor.web3.Keypair.generate();

    await Promise.all([
      create(anotherSoul),
      create(soul),
    ]);

    await program.rpc.praise({
      accounts: {
        anotherSoul: anotherSoul.publicKey,
        soul: soul.publicKey,
      },
      signers: [anotherSoul],
    }).then(() => {
      assert.fail('ERR: this was expected to fail!');
    }).catch(async () => {
      const accounts = await Promise.all([
        program.account.soul.fetch(anotherSoul.publicKey),
        program.account.soul.fetch(soul.publicKey),
      ]);

      // anotherSoul karma MUST remain zeroed
      assert.equal(accounts[0].karma.toNumber(), 0);

      // soul karma MUST remain zeroed
      assert.equal(accounts[1].karma.toNumber(), 0);
    });
  });

  it("requires valid signature to accuse another soul", async () => {
    const anotherSoul = anchor.web3.Keypair.generate();
    const soul = anchor.web3.Keypair.generate();

    await Promise.all([
      create(anotherSoul),
      create(soul),
    ]);

    await program.rpc.accuse({
      accounts: {
        anotherSoul: anotherSoul.publicKey,
        soul: soul.publicKey,
      },
      signers: [anotherSoul],
    }).then(() => {
      assert.fail('ERR: this was expected to fail!');
    }).catch(async () => {
      const accounts = await Promise.all([
        program.account.soul.fetch(anotherSoul.publicKey),
        program.account.soul.fetch(soul.publicKey),
      ]);

      // anotherSoul karma MUST remain zeroed
      assert.equal(accounts[0].karma.toNumber(), 0);

      // soul karma MUST remain zeroed
      assert.equal(accounts[1].karma.toNumber(), 0);
    });
  });
});

async function praise(anotherSoul: anchor.web3.Keypair, soul: anchor.web3.Keypair) {
  await program.rpc.praise({
    accounts: {
      anotherSoul: anotherSoul.publicKey,
      soul: soul.publicKey,
    },
    signers: [soul],
  });
}

async function accuse(anotherSoul: anchor.web3.Keypair, soul: anchor.web3.Keypair) {
  await program.rpc.accuse({
    accounts: {
      anotherSoul: anotherSoul.publicKey,
      soul: soul.publicKey,
    },
    signers: [soul],
  });
}

function create(soul: anchor.web3.Keypair) {
  return program.rpc.create(provider.wallet.publicKey, {
    accounts: {
      soul: soul.publicKey,
      authority: provider.wallet.publicKey,
      systemProgram: SystemProgram.programId,
    },
    signers: [soul],
  });
}
