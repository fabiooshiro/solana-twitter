import { computed } from 'vue'
import { useAnchorWallet } from 'solana-wallets-vue'
import { Connection, PublicKey } from '@solana/web3.js'
import { Program, Provider } from '@project-serum/anchor'
import { ethers } from "ethers";
import idl from '@/idl/solana_twitter.json'
import { getProgram } from '../cartesi/solana/adapter';

const clusterUrl = process.env.VUE_APP_CLUSTER_URL as any
const preflightCommitment = 'processed'
const commitment = 'processed'
const programID = new PublicKey(idl.metadata.address)
let workspace: any = null
let connectWalletPromise: any = null
export const useWorkspace = async () => {
    if (!workspace) {
        await connectWalletPromise
    }
    return workspace
}

export const initWorkspace = () => {
    connectWalletPromise = connectWallet();
    /* const wallet = useAnchorWallet()
    const connection = new Connection(clusterUrl, commitment)
    const provider = computed(() => new Provider(connection, wallet.value, { preflightCommitment, commitment }))
    const program = computed(() => new Program(idl, programID, provider.value))

    workspace = {
        wallet,
        connection,
        provider,
        program,
    } */
}

async function connectWallet() {
    try {
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
        const { program, provider: providerEth, wallet, connection } = await getProgram(signer, idl)
        //this.currentAccount = accounts[0];
        workspace = {
            wallet,
            connection,
            provider: providerEth,
            program,
        }
    } catch (error) {
        console.log(error);
    }
}