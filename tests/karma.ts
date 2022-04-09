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
    const karma = anchor.web3.Keypair.generate();

    await create(karma);

    let createdKarma = await program.account.soul.fetch(karma.publicKey);

    assert.ok(createdKarma.authority.equals(provider.wallet.publicKey));
    assert.equal(createdKarma.karma.toNumber(), 0);
    assert.equal(createdKarma.energy, 2400);
    assert.equal(createdKarma.sunrise.toNumber() > 0, true);
  });

  it("ignores sunrise ahead of time", async () => {
    const reported = anchor.web3.Keypair.generate();
    const reporter = anchor.web3.Keypair.generate();

    await Promise.all([
      create(reported),
      create(reporter),
    ]);

    let accounts = await Promise.all([
      program.account.soul.fetch(reported.publicKey),
      program.account.soul.fetch(reporter.publicKey),
    ]);

    const initialSunrise = accounts[1].sunrise.toNumber();

    assert.equal(accounts[1].energy, 2400);

    await good(reported, reporter);

    accounts = await Promise.all([
      program.account.soul.fetch(reported.publicKey),
      program.account.soul.fetch(reporter.publicKey),
    ]);

    assert.equal(accounts[1].energy, 2300);

    await program.rpc.sunrise({
      accounts: {
        soul: reporter.publicKey,
      },
      signers: [reporter],
    });

    await program.account.soul.fetch(reporter.publicKey).then(
      account => {
        // sunrise MUST NOT have changed!
        assert.equal(account.sunrise.toNumber(), initialSunrise);
        // energy MUST NOT have changed either
        assert.equal(account.energy, 2300);
      }
    )
  });

  it("requires valid signer to create karma", async () => {
    const karma = anchor.web3.Keypair.generate();
    const anotherKarma = anchor.web3.Keypair.generate();

    await program.rpc.create(provider.wallet.publicKey, {
      accounts: {
        soul: karma.publicKey,
        authority: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      },
      signers: [anotherKarma],
    }).then(() => {
      assert.fail('ERR: this was expected to fail!');
    }).catch(() => {
      // ok, it failed as expected.
    });
  });

  it("counts good interaction", async () => {
    const reported = anchor.web3.Keypair.generate();
    const reporter = anchor.web3.Keypair.generate();

    await Promise.all([
      create(reported),
      create(reporter),
    ]);

    await good(reported, reporter);

    const accounts = await Promise.all([
      program.account.soul.fetch(reported.publicKey),
      program.account.soul.fetch(reporter.publicKey),
    ]);

    assert.equal(accounts[0].karma.toNumber(), 1);
    assert.equal(accounts[1].karma.toNumber(), 1);

    // active interaction MUST consume some energy: -100 joules
    assert.equal(accounts[1].energy.valueOf(), 2300);

    // passive interaction MUST NOT consume any energy.
    assert.equal(accounts[0].energy.valueOf(), 2400);
  });

  it("counts bad interaction", async () => {
    const reported = anchor.web3.Keypair.generate();
    const reporter = anchor.web3.Keypair.generate();

    await Promise.all([
      create(reported),
      create(reporter),
    ]);

    await bad(reported, reporter);

    const accounts = await Promise.all([
      program.account.soul.fetch(reported.publicKey),
      program.account.soul.fetch(reporter.publicKey),
    ]);

    assert.equal(accounts[0].karma.toNumber(), -1);
    assert.equal(accounts[1].karma.toNumber(), -1);
  });

  it("accumulates interactions", async () => {
    const reported = anchor.web3.Keypair.generate();
    const reporter = anchor.web3.Keypair.generate();
    const anotherKarma = anchor.web3.Keypair.generate();

    await Promise.all([
      create(reported),
      create(reporter),
      create(anotherKarma),
    ]);

    await Promise.all([
      good(reported, reporter),
      good(anotherKarma, reporter),
    ]);

    const accounts = await Promise.all([
      program.account.soul.fetch(reported.publicKey),
      program.account.soul.fetch(anotherKarma.publicKey),
      program.account.soul.fetch(reporter.publicKey),
    ]);

    assert.equal(accounts[0].karma.toNumber(), 1);
    assert.equal(accounts[1].karma.toNumber(), 1);

    // this one had two good interactions
    assert.equal(accounts[2].karma.toNumber(), 2);

    // active interaction MUST consume some energy: 2400 - 200 = 2200
    assert.equal(accounts[2].energy.valueOf(), 2200);
  });

  it("ignores interaction when energy is not sufficient", async () => {
    const karma = anchor.web3.Keypair.generate();
    const others = Array.from(Array(24)).map(() => anchor.web3.Keypair.generate());

    await Promise.all(
      others.map((other) => create(other))
        .concat([
          create(karma)
        ])
    );

    await Promise.all(
      others.map(
        (other) => program.account.soul.fetch(other.publicKey).then(
          account => {
            // accounts created with zeroed balance and 2400 joules
            assert.equal(account.karma.toNumber(), 0);
            assert.equal(account.energy, 2400);
          }
        )
      )
    );

    await Promise.all(
      others.map((other) => good(other, karma))
    );

    await Promise.all(
      others.map(
        (other) => program.account.soul.fetch(other.publicKey)
          .then( account => {
            // other accounts balance MUST have changed
            assert.equal(account.karma.toNumber(), 1);
            // .. but their energy MUST NOT have changed, because they were in passive mode.
            assert.equal(account.energy, 2400);
          })
      )
    );

    await program.account.soul.fetch(karma.publicKey).then(
      account => {
        // active karma's energy MUST be empty now after 24 active interactions.
        assert.equal(account.energy, 0);
      }
    )

    // ... and another interaction MUST NOT cause any changes
    await good(others[0], karma)

    await Promise.all([
      program.account.soul.fetch(others[0].publicKey).then(
        account => {
          // passive karma's energy MUST NOT change
          assert.equal(account.energy, 2400);

          // balance MUST NOT change either, because interaction MUST have been ignored.
          assert.equal(account.karma.toNumber(), 1);
        }
      ),
      program.account.soul.fetch(karma.publicKey).then(
        account => {
          // balance MUST NOT change...
          assert.equal(account.karma.toNumber(), 24);

          // ... energy MUST NOT change either!
          assert.equal(account.energy, 0);
        }
      )
    ]);
  });

  it("requires valid signature for good interaction", async () => {
    const reported = anchor.web3.Keypair.generate();
    const reporter = anchor.web3.Keypair.generate();

    await Promise.all([
      create(reported),
      create(reporter),
    ]);

    await program.rpc.good({
      accounts: {
        reported: reported.publicKey,
        reporter: reporter.publicKey,
      },
      signers: [reported],
    }).then(() => {
      assert.fail('ERR: this was expected to fail!');
    }).catch(async () => {
      const accounts = await Promise.all([
        program.account.soul.fetch(reported.publicKey),
        program.account.soul.fetch(reporter.publicKey),
      ]);

      // reported karma MUST remain zeroed
      assert.equal(accounts[0].karma.toNumber(), 0);

      // reporter karma MUST remain zeroed
      assert.equal(accounts[1].karma.toNumber(), 0);
    });
  });

  it("requires valid signature for bad interaction", async () => {
    const reported = anchor.web3.Keypair.generate();
    const reporter = anchor.web3.Keypair.generate();

    await Promise.all([
      create(reported),
      create(reporter),
    ]);

    await program.rpc.bad({
      accounts: {
        reported: reported.publicKey,
        reporter: reporter.publicKey,
      },
      signers: [reported],
    }).then(() => {
      assert.fail('ERR: this was expected to fail!');
    }).catch(async () => {
      const accounts = await Promise.all([
        program.account.soul.fetch(reported.publicKey),
        program.account.soul.fetch(reporter.publicKey),
      ]);

      // reported karma MUST remain zeroed
      assert.equal(accounts[0].karma.toNumber(), 0);

      // reporter karma MUST remain zeroed
      assert.equal(accounts[1].karma.toNumber(), 0);
    });
  });
});

async function good(reported: anchor.web3.Keypair, reporter: anchor.web3.Keypair) {
  await program.rpc.good({
    accounts: {
      reported: reported.publicKey,
      reporter: reporter.publicKey,
    },
    signers: [reporter],
  });
}

async function bad(reported: anchor.web3.Keypair, reporter: anchor.web3.Keypair) {
  await program.rpc.bad({
    accounts: {
      reported: reported.publicKey,
      reporter: reporter.publicKey,
    },
    signers: [reporter],
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
