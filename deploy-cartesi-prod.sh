
cd ../rollups-examples
export ROLLUPS_EXAMPLES=`pwd`
cd -

docker run \
    -v `pwd`:/workdir \
    -v $ROLLUPS_EXAMPLES:/rollups-examples \
    -w /workdir \
    cartesi/toolchain:0.11.0 \
    ./build-prod.sh


cp ./target/riscv64ima-cartesi-linux-gnu/release/solana-twitter ../rollups-examples/solana-adapter/solana_smart_contract_bin/AsfUa1c9BrGJVvpo2xq712wCGBwpaXrkjhfvhkpg2gyE
