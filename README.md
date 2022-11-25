# Solana Twitter

This is the best twitter ever.

Build
```shell
anchor build
```

Set the program id for development  
**DO NOT USE THIS KEY IN PRODUCTION!!!**
```
cp DEVemLxXHPz1tbnBbTVXtvNBHupP2RCBw1jTFN8Uz3FD.json ./target/deploy/solana_twitter-keypair.json
```

Run the local test validator
```shell
solana-test-validator
```

```shell
anchor build
anchor deploy
anchor run copy-idl
anchor run copy-types
```

## Cartesi

To enable the [Cartesi](https://cartesi.io/) support, open the browser inspect and run on console:
```js
localStorage.getItem('ctsi_sol') === '1'
```

Clone the rollups-examples:
```shell
git clone git@github.com:Calindra/rollups-examples.git
git checkout feature/solana-adapter
```

The directory structure:
```shell
workspace
├── rollups-examples
└── solana-twitter
```

The script `deploy-cartesi-prod.sh` will compile the binary program to run inside the Cartesi Machine.

The script `deploy-cartesi.sh` will compile to run the Cartesi in host mode.

Both of them will write the binary program at `../rollups-examples/solana-adapter/solana_smart_contract_bin/DEVemLxXHPz1tbnBbTVXtvNBHupP2RCBw1jTFN8Uz3FD`
