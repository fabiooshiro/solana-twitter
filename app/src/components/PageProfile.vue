<script setup>
import { computed, ref, watchEffect } from 'vue'
import { ethers } from "ethers";
import { paginateTweets, authorFilter } from '@/api'
import TweetForm from '@/components/TweetForm'
import TweetList from '@/components/TweetList'
import { useWorkspace } from '@/composables'
import { cartesiRollups } from '@/cartesi/utils/cartesi'
import { IERC20__factory } from "@cartesi/rollups";
import * as anchor from "@project-serum/anchor";
import { loadVouchers, executeVoucher } from "@/cartesi/utils/vouchers";

import { convertEthAddress2Solana } from '@/cartesi/solana/adapter'
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';
//import { PublicKey } from '@solana/web3.js';

const tweets = ref([])
const { wallet, connection } = useWorkspace()

const filters = ref([])

const onNewPage = newTweets => tweets.value.push(...newTweets)
const { prefetch, hasNextPage, getNextPage, loading } = paginateTweets(filters, 10, onNewPage)

const token = ref('0x67d269191c92Caf3cD7723F116c85e6E9bf55933')
//const token = ref('')
const vouchers = ref([])

watchEffect(() => {
    if (!wallet.value) return;
    loadBalance(token.value, connection, wallet);
    listVouchers();
    tweets.value = [];
    filters.value = [authorFilter(wallet.value.publicKey.toBase58())];
    prefetch().then(getNextPage);
})

const amount = ref(0)
const effectiveToken = computed(() => {
    loadBalance(token.value, connection, wallet)
    return token.value
})

const effectiveAmount = computed(() => amount.value)
const addTweet = tweet => tweets.value.push(tweet)
const canTweet = computed(() => true)
const solanaTokenAmount = ref(0)
const ethersTokenAmount = ref(0)

async function loadBalance(ethTokenAddress, connection) {
    if (ethTokenAddress.length != 42) {
        return
    }
    const { signer } = useWorkspace()
    if (!signer) {
        console.log('no signer')
        return
    }
    console.log('load token balance')

    const mint = convertEthAddress2Solana(ethTokenAddress)
    const address = await signer.getAddress()
    const owner = convertEthAddress2Solana(address)
    // console.log({ owner, mint })
    const ata = await getAssociatedTokenAddress(mint, owner, true)
    console.log({ ata: ata.toString() })
    const tokenAccountInfo = await getAccount(
        connection,
        ata
    )
    solanaTokenAmount.value = tokenAccountInfo.amount

    const erc20Contract = IERC20__factory.connect(
        ethTokenAddress,
        signer
    );
    const balance = await erc20Contract.balanceOf(address)
    ethersTokenAmount.value = balance
}

async function send() {
    const { signer } = useWorkspace()
    const { erc20Portal } = await cartesiRollups(signer)
    const erc20Amount = ethers.BigNumber.from(amount.value);
    const signerAddress = await signer.getAddress();
    const erc20Address = token.value;
    const erc20Contract = IERC20__factory.connect(
        erc20Address,
        signer
    );
    const allowance = await erc20Contract.allowance(
        signerAddress,
        erc20Portal.address
    );
    if (allowance.lt(erc20Amount)) {
        const allowanceApproveAmount =
            ethers.BigNumber.from(erc20Amount).sub(allowance);
        console.log(
            `approving allowance of ${allowanceApproveAmount} tokens...`
        );
        const tx = await erc20Contract.approve(
            erc20Portal.address,
            allowanceApproveAmount
        );
        await tx.wait();
    }
    const tx = await erc20Portal.erc20Deposit(erc20Address, erc20Amount, "0x")
    console.log('Sending', erc20Portal)
    console.log(`transaction: ${tx.hash}`);
    console.log("waiting for confirmation...");
    const receipt = await tx.wait();
    console.log({ receipt })
}

async function emitVoucher() {
    console.log('Creating voucher...');
    const { signer } = useWorkspace()
    const { inputContract } = await cartesiRollups(signer)
    const {
        keccak256
    } = require("@ethersproject/keccak256");
    const header = keccak256(ethers.utils.toUtf8Bytes("Create ERC-20 Voucher"))
    const headerBytes = ethers.utils.arrayify(header)
    const erc20Amount = new anchor.BN(amount.value);
    const amountBytes = erc20Amount.toArrayLike(Buffer, 'be', 8);
    const erc20Bytes = ethers.utils.arrayify(token.value)
    console.log(header, headerBytes)
    // info: amount, erc20 address
    const inputBytes = Buffer.from([
        ...headerBytes,
        ...amountBytes,
        ...erc20Bytes,
    ]);
    console.log(ethers.utils.hexlify(inputBytes));
    const tx = await inputContract.addInput(inputBytes);
    const receipt = await tx.wait(1);
    console.log('Receipt', receipt);
}

async function listVouchers() {
    const url = 'http://localhost:4000/graphql';
    vouchers.value = await loadVouchers(url, {})
    console.log(vouchers.value)
}

async function execVoucher(id) {
    console.log(`execute voucher ${id}`);
    const { signer } = useWorkspace();
    await executeVoucher(signer, id);
}

function mask(address) {
    if (!address || typeof address !== 'string') {
        return ''
    }
    return address.substring(0, 6) + '..' + address.substring(address.length - 4);
}

</script>

<template>
    <div v-if="wallet" class="border-b px-8 py-4 bg-gray-50 break-all">
        {{ wallet.publicKey.toBase58() }}
    </div>
    <div class="border-b px-8 py-4 break-all">
        <input type="text" placeholder="token" class="text-pink-500 rounded-full pl-10 pr-4 py-2 bg-gray-100"
            :value="effectiveToken" @input="token = $event.target.value">
        <div class="py-4 break-all">
            <input type="text" placeholder="amount" class="text-pink-500 rounded-full pl-10 pr-4 py-2 bg-gray-100"
                :value="effectiveAmount" @input="amount = $event.target.value">
        </div>
        <button style="margin-right: 7px;" class="text-white px-4 py-2 rounded-full font-semibold" :disabled="!canTweet"
            :class="canTweet ? 'bg-pink-500' : 'bg-pink-300 cursor-not-allowed'" @click="send">
            Transfer from L1 to L2
        </button>
        <button class="text-white px-4 py-2 rounded-full font-semibold" :disabled="!canTweet"
            :class="canTweet ? 'bg-pink-500' : 'bg-pink-300 cursor-not-allowed'" @click="emitVoucher">
            Emit Voucher
        </button>
        <div class="px-6 py-4 break-all">
            L1 amount: {{ ethersTokenAmount }}
        </div>
        <div class="px-6 break-all">
            L2 amount: {{ solanaTokenAmount }}
        </div>
        <table style="margin-top: 7px;">
            <thead>
                <tr>
                    <th>id</th>
                    <th>token</th>
                    <th>recipient</th>
                    <th>amount</th>
                    <th>#</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="voucher in vouchers" :key="voucher.id">
                    <td>{{ voucher.id }}</td>
                    <td>{{ mask(voucher.destination) }}</td>
                    <td>{{ mask(voucher.extra?.recipient) }}</td>
                    <td>{{ voucher.extra?.amount?.toString() }}</td>
                    <td>
                        <button class="text-white px-4 py-2 rounded-full font-semibold bg-pink-500" @click="() => execVoucher(voucher.id)">
                            Exec
                        </button>
                    </td>
                </tr>
            </tbody>
        </table>

    </div>

    <tweet-form @added="addTweet"></tweet-form>
    <tweet-list v-model:tweets="tweets" :loading="loading" :has-more="hasNextPage" @more="getNextPage"></tweet-list>
</template>
