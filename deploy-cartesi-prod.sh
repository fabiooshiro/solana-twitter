
cd ../rollups-examples
export ROLLUPS_EXAMPLES=`pwd`
cd -

docker run \
    -v `pwd`:/workdir \
    -v $ROLLUPS_EXAMPLES:/rollups-examples \
    -w /workdir \
    --rm \
    cartesi/toolchain:0.11.0 \
    ./build-prod.sh


