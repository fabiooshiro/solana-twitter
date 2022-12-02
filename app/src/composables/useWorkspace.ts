import { computed, ref } from 'vue'
import { useAnchorWallet } from 'solana-wallets-vue'
import { Connection, PublicKey } from '@solana/web3.js'
import { AnchorProvider, Program } from '@project-serum/anchor'
import { ethers } from "ethers";
import idl from '@/anchor/idl/solana_twitter.json'
import { getProgram } from '../cartesi/solana/adapter';
import { SolanaTwitter } from '@/anchor/types/solana_twitter';

const clusterUrl = process.env.VUE_APP_CLUSTER_URL as any
const preflightCommitment = 'processed'
const commitment = 'processed'
const programID = new PublicKey(idl.metadata.address)
let workspace: any = null

export const useWorkspace = () => {
    return workspace
}

export const initWorkspace = () => {
    if (isCartesiDAppEnv()) {
        createAdaptedWorkspace();
    } else {
        createWorkspace()
    }
}

export function isCartesiDAppEnv() {
    return localStorage.getItem('ctsi_sol') === '1'
}

function createWorkspace() {
    const wallet = useAnchorWallet()
    const connection = new Connection(clusterUrl, commitment)
    const provider = computed(() => {
        return new AnchorProvider(connection, (wallet.value || {}) as any, { preflightCommitment, commitment })
    })
    const program = computed(() => {
        return new Program<SolanaTwitter>(idl as any, programID, provider.value)
    })

    workspace = {
        wallet,
        connection: ref(connection),
        provider,
        program,
    }
}

export async function connectMetaMaskWallet() {
    const { ethereum } = window as any;
    if (!ethereum) {
        alert("Get MetaMask!");
        return;
    }
    // A Web3Provider wraps a standard Web3 provider, which is
    // what MetaMask injects as window.ethereum into each page
    const provider = new ethers.providers.Web3Provider(ethereum)

    // MetaMask requires requesting permission to connect users accounts
    await provider.send("eth_requestAccounts", []);

    // The MetaMask plugin also allows signing transactions to
    // send ether and pay to change state within the blockchain.
    // For this, you need the account signer...
    const signer = provider.getSigner()
    console.log("Signer", signer);
    const { program, provider: providerEth, wallet, connection } = getProgram<SolanaTwitter>(signer, idl)
    connection.etherSigner = signer;
    connection.wallet = wallet;
    workspace.wallet.value = wallet;
    workspace.program.value = program;
    workspace.provider.value = providerEth;
    workspace.signer = signer;
    workspace.connection.value = connection;
    wallet.connected = true
}

async function checkMetaMaskConnected() {
    const { ethereum } = window as any;
    if (!ethereum) {
        return;
    }
    const accounts = await ethereum.request({ method: 'eth_accounts' });
    if (accounts.length) {
        connectMetaMaskWallet()
    }
    ethereum.on('accountsChanged', checkMetaMaskConnected);
}

checkMetaMaskConnected()

function createAdaptedWorkspace() {
    try {
        const { connection, program, provider: providerEth, wallet } = getProgram<SolanaTwitter>(undefined, idl)

        workspace = {
            wallet: ref(wallet),
            connection: ref(connection),
            provider: ref(providerEth),
            program: ref(program),
        }
    } catch (error) {
        console.log(error);
    }
}