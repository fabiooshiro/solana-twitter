
rm -rf ./target
cd ./programs/solana-twitter && cargo build -Z build-std=std,core,alloc,panic_abort,proc_macro --target ../../riscv64ima-cartesi-linux-gnu.json --release

cd -
cp ./target/riscv64ima-cartesi-linux-gnu/release/solana-twitter /rollups-examples/solana-adapter/solana_smart_contract_bin/DEVemLxXHPz1tbnBbTVXtvNBHupP2RCBw1jTFN8Uz3FD

rm -rf ./target

echo "done."
