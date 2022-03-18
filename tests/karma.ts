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

    let reportedAccount = await program.account.karma.fetch(karma.publicKey);

    assert.ok(reportedAccount.authority.equals(provider.wallet.publicKey));
    assert.equal(reportedAccount.balance.toNumber(), 0);
  });

  it("requires valid signer to create karma", async () => {
    const karma = anchor.web3.Keypair.generate();
    const anotherKarma = anchor.web3.Keypair.generate();

    await program.rpc.create(provider.wallet.publicKey, {
      accounts: {
        karma: karma.publicKey,
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
      program.account.karma.fetch(reported.publicKey),
      program.account.karma.fetch(reporter.publicKey),
    ]);

    assert.equal(accounts[0].balance.toNumber(), 1);
    assert.equal(accounts[1].balance.toNumber(), 1);
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
      program.account.karma.fetch(reported.publicKey),
      program.account.karma.fetch(reporter.publicKey),
    ]);

    assert.equal(accounts[0].balance.toNumber(), -1);
    assert.equal(accounts[1].balance.toNumber(), -1);
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
      program.account.karma.fetch(reported.publicKey),
      program.account.karma.fetch(anotherKarma.publicKey),
      program.account.karma.fetch(reporter.publicKey),
    ]);

    assert.equal(accounts[0].balance.toNumber(), 1);
    assert.equal(accounts[1].balance.toNumber(), 1);

    // this one had two good interactions
    assert.equal(accounts[2].balance.toNumber(), 2);
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
        program.account.karma.fetch(reported.publicKey),
        program.account.karma.fetch(reporter.publicKey),
      ]);

      // reported karma MUST remain zeroed
      assert.equal(accounts[0].balance.toNumber(), 0);

      // reporter karma MUST remain zeroed
      assert.equal(accounts[1].balance.toNumber(), 0);
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
        program.account.karma.fetch(reported.publicKey),
        program.account.karma.fetch(reporter.publicKey),
      ]);

      // reported karma MUST remain zeroed
      assert.equal(accounts[0].balance.toNumber(), 0);

      // reporter karma MUST remain zeroed
      assert.equal(accounts[1].balance.toNumber(), 0);
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

function create(karma: anchor.web3.Keypair) {
  return program.rpc.create(provider.wallet.publicKey, {
    accounts: {
      karma: karma.publicKey,
      authority: provider.wallet.publicKey,
      systemProgram: SystemProgram.programId,
    },
    signers: [karma],
  });
}
