.PHONY: solana/keygen
solana/keygen:
	solana-keygen new --force --no-bip39-passphrase  -o /root/.config/solana/id.json
