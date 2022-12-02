/* eslint-disable @typescript-eslint/no-unused-vars */
import { AccountInfo, clusterApiUrl, Commitment, ConfirmOptions, Connection, GetAccountInfoConfig, GetMultipleAccountsConfig, GetProgramAccountsConfig, Keypair, PublicKey, RpcResponseAndContext, SendOptions, SerializeConfig, SignatureResult, Signer, SystemProgram, Transaction, TransactionSignature } from "@solana/web3.js";
import { Buffer } from 'buffer';
import { ContractReceipt, ethers } from 'ethers';
import { InputAddedEvent } from "@cartesi/rollups/dist/src/types/contracts/interfaces/IInput";

import * as anchor from "@project-serum/anchor";
import idl from './models/solzen.json';
import { AnchorProvider, Idl, Program } from "@project-serum/anchor";
import { Wallet } from "@project-serum/anchor/dist/cjs/provider";
import { cartesiRollups } from "../utils/cartesi";
import { getReports } from "./graphql/reports";
import { OutputValidityProofStruct } from "@cartesi/rollups/dist/src/types/contracts/facets/OutputFacet";
import erc1155 from './models/MyERC1155NFT.json';
import axios from "axios";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
//const console = {
//    log: (..._args: any[]) => {}
//};
export const DEFAULT_GRAPHQL_URL = `${process.env.VUE_APP_CARTESI_GRAPHQL_URL}`;
const DEFAULT_INSPECT_URL = `${process.env.VUE_APP_CARTESI_INSPECT_URL}`;
export const programID = new PublicKey(idl.metadata.address);
const encoder = new TextEncoder()

export const toBuffer = (arr: Buffer | Uint8Array | Array<number>): Buffer => {
    if (Buffer.isBuffer(arr)) {
        return arr;
    } else if (arr instanceof Uint8Array) {
        return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    } else {
        return Buffer.from(arr);
    }
};

export async function findDaoAddress(daoSlug: string) {
    return await PublicKey.findProgramAddress([
        encoder.encode('dao'),
        Buffer.from(daoSlug.slice(0, 32)),
    ], programID)
}

export async function findValidationAddress(daoPubkey: PublicKey, walletPublicKey: PublicKey) {
    return await PublicKey.findProgramAddress([
        anchor.utils.bytes.utf8.encode('child'),
        walletPublicKey.toBuffer(),
        daoPubkey.toBuffer(),
    ], programID);
}

export class AdaptedWallet implements Wallet {
    public connected = false;

    public payer = Keypair.fromSecretKey(Uint8Array.from([
        121, 122, 251, 173, 123, 1, 141, 44, 75, 160, 11,
        107, 14, 238, 24, 175, 213, 180, 116, 96, 185, 108,
        36, 202, 121, 64, 84, 243, 230, 252, 143, 86, 23,
        38, 214, 28, 85, 180, 211, 69, 250, 22, 31, 72,
        53, 69, 227, 12, 92, 172, 150, 196, 4, 59, 219,
        216, 77, 34, 176, 132, 80, 157, 198, 198
    ]))

    private _publicKey: PublicKey = this.payer.publicKey;

    async signTransaction(tx: anchor.web3.Transaction): Promise<anchor.web3.Transaction> {
        console.log('signTransaction...')
        const msg = tx.compileMessage()
        console.log(msg.accountKeys.map(k => k.toBase58()))

        // just fill the signature bytes
        const signature = Buffer.alloc(64);

        tx.addSignature(this._publicKey, signature);

        tx.serialize = function (_config?: SerializeConfig): Buffer {
            const signData = this.serializeMessage();
            return (this as any)._serialize(signData);
        }
        return tx;
    }

    signAllTransactions(txs: anchor.web3.Transaction[]): Promise<anchor.web3.Transaction[]> {
        throw new Error("Method not implemented.");
    }

    get publicKey(): PublicKey {
        return this._publicKey;
    }

    set publicKey(pk) {
        this._publicKey = pk
    }
}

export type InputKeys = {
    epoch_index?: number;
    input_index?: number;
};

/**
 * Retrieve InputKeys from an InputAddedEvent
 * @param receipt Blockchain transaction receipt
 * @returns input identification keys
 */
export const getInputKeys = (receipt: ContractReceipt): InputKeys => {
    // get InputAddedEvent from transaction receipt
    const event = receipt.events?.find((e) => e.event === "InputAdded");

    if (!event) {
        throw new Error(
            `InputAdded event not found in receipt of transaction ${receipt.transactionHash}`
        );
    }

    const inputAdded = event as InputAddedEvent;
    return {
        epoch_index: inputAdded.args.epochNumber.toNumber(),
        input_index: inputAdded.args.inputIndex.toNumber(),
    };
};

class AnchorProviderAdapter extends AnchorProvider {
    public etherSigner: ethers.Signer | undefined

    async sendAndConfirm(tx: Transaction,
        signers?: Signer[],
        opts?: ConfirmOptions
    ): Promise<TransactionSignature> {
        if (opts === undefined) {
            opts = this.opts;
        }

        tx.feePayer = this.wallet.publicKey;
        tx.recentBlockhash = (
            await this.connection.getRecentBlockhash(opts.preflightCommitment)
        ).blockhash;

        tx = await this.wallet.signTransaction(tx);
        //(signers ?? []).forEach((kp) => {
        //    tx.partialSign(kp);
        //});

        const rawTx = tx.serialize();
        const payload = toBuffer(rawTx).toString('base64');
        console.log('Cartesi Rollups payload', payload);
        const inputBytes = ethers.utils.toUtf8Bytes(payload);

        if (this.etherSigner) {
            const { inputContract } = await cartesiRollups(this.etherSigner);

            // send transaction
            const txEth = await inputContract.addInput(inputBytes);
            console.log(`transaction: ${txEth.hash}`);
            console.log("waiting for confirmation...");
            const receipt = await txEth.wait(1);
            console.log('receipt ok');
            const inputReportResults = await pollingReportResults(receipt);
            console.log({ inputReportResults })
            if (inputReportResults?.find(report => report.json.error)) {
                throw new Error('Unexpected error');
            }
        }
        return { ok: 1 } as any
    }
}

export async function pollingReportResults(receipt: ContractReceipt) {
    const MAX_REQUESTS = 10;
    const inputKeys = getInputKeys(receipt);
    console.log(`InputKeys: ${JSON.stringify(inputKeys, null, 4)}`);
    for (let i = 0; i < MAX_REQUESTS; i++) {
        await delay(1000 * (i + 1));
        const reports = await getReports(DEFAULT_GRAPHQL_URL, inputKeys);
        console.log(`Cartesi reports: ${JSON.stringify(reports, null, 4)}`);
        if (reports.length > 0) {
            return reports.map(r => {
                const strJson = ethers.utils.toUtf8String(r.payload);
                return {
                    ...r,
                    json: JSON.parse(strJson)
                };
            })
        }
    }
}

class ConnectionAdapter extends Connection {
    public etherSigner: ethers.Signer | undefined
    public wallet: AdaptedWallet | undefined

    confirmTransaction(
        signature: any,
        commitment?: Commitment,
    ): Promise<RpcResponseAndContext<SignatureResult>> {
        return { value: {} } as any
    }

    async getBalance(publicKey: PublicKey, commitment?: Commitment | undefined): Promise<number> {
        const accountInfo = await this.getAccountInfo(publicKey, commitment);
        return accountInfo?.lamports || 0;
    }

    async sendTransaction(
        tx: any,
        _signers: any,
        options?: SendOptions,
    ): Promise<TransactionSignature> {
        console.log('sending transaction from adapter');
        if (!this.wallet) {
            throw new Error('Wallet is undefined');
        }
        if (options === undefined) {
            options = {
                preflightCommitment: this.commitment
            }
        }
        tx.feePayer = this.wallet.publicKey;
        tx.recentBlockhash = (
            await this.getRecentBlockhash(options.preflightCommitment)
        ).blockhash;

        tx = await this.wallet.signTransaction(tx);

        // aqui deveriamos possibilitar assinar dado o par de chaves
        // (signers ?? []).forEach((kp) => {
        //     tx.partialSign(kp);
        // });

        const rawTx = tx.serialize();
        const payload = toBuffer(rawTx).toString('base64');
        console.log('Cartesi Rollups payload', payload);
        const inputBytes = ethers.utils.toUtf8Bytes(payload);

        if (this.etherSigner) {
            const { inputContract } = await cartesiRollups(this.etherSigner);

            // send transaction
            const txEth = await inputContract.addInput(inputBytes);
            console.log(`transaction: ${txEth.hash}`);
            console.log("waiting for confirmation...");
            const receipt = await txEth.wait(1);
            console.log('receipt ok');
            const inputReportResults = await pollingReportResults(receipt);
            console.log({ inputReportResults })
            if (inputReportResults?.find(report => report.json.error)) {
                throw new Error('Unexpected error');
            }
        }

        // TODO: dummy
        return "z3U6bsqf2RypqPYsng5mne5mBoQbrsUnT7RWyGuUz76ssq21QbmLrjh7Am6urSdceqhCWdp2CzJShEG2JB4aqcA";
    }

    private getInspectBaseURL() {
        if (DEFAULT_INSPECT_URL !== 'detect') {
            return DEFAULT_INSPECT_URL;
        } else {
            if (typeof window === 'undefined') {
                return 'http://127.0.0.1:5005/inspect';
            }
            let host = window.location.host;
            const protocol = window.location.protocol;
            if (/^[0-9]{4}/.test(host)) {
                // gitpod host
                host = host.replace(/^[0-9]*/, '5005');
            } else {
                // localhost like
                host = host.replace(/:[0-9]+$/, ':5005')
            }
            const url = `${protocol}//${host}/inspect`;
            return url;
        }
    }

    async requestAirdrop(
        toPubkey: PublicKey,
        lamports: number,
    ): Promise<TransactionSignature> {

        // Public Key that give me SOL on devnet
        // https://explorer.solana.com/tx/4aTCJyxNstBdxEJmH2CiTeBghMusTQ66ox7iGPMARSUoiKjBCsAvKwAuJa2kcAn2kJuyCpc9pyrhfTwZs8Zkfn6r?cluster=devnet
        const fromPubkey = new PublicKey("9B5XszUGdMaxCZ7uSQhPzdks5ZQSmWxrmzCSvtJ6Ns6g");
        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey,
                toPubkey,
                lamports
            })
        )
        await this.sendTransaction(transaction, []);

        // TODO: dummy
        return "z3U6bsqf2RypqPYsng5mne5mBoQbrsUnT7RWyGuUz76ssq21QbmLrjh7Am6urSdceqhCWdp2CzJShEG2JB4aqcA";
    }

    getMultipleAccountsInfo(
        publicKeys: PublicKey[],
        commitmentOrConfig?: Commitment | GetMultipleAccountsConfig,
    ): Promise<(AccountInfo<Buffer> | null)[]> {
        const promises = publicKeys.map(pk => this.getAccountInfo(pk));
        return Promise.all(promises);
    }

    async getAccountInfo(
        publicKey: PublicKey,
        _commitmentOrConfig?: Commitment | GetAccountInfoConfig,
    ): Promise<AccountInfo<Buffer> | null> {
        const baseURL = this.getInspectBaseURL();
        const url = `${baseURL}/accountInfo/${publicKey.toBase58()}`;
        console.log('Cartesi inspect url', url);
        const resp = await axios.get(url.toString());
        const cartesiResponse = resp.data;
        if (!cartesiResponse.reports || !cartesiResponse.reports.length) {
            //console.log('Fallback to solana getAccountInfo')
            //return super.getAccountInfo(publicKey, commitmentOrConfig);
            return null;
        }
        const jsonString = ethers.utils.toUtf8String(cartesiResponse.reports[0].payload);
        const infoData = JSON.parse(jsonString);
        // console.log({ [publicKey.toBase58()]: infoData })
        return {
            owner: new PublicKey(infoData.owner),
            data: Buffer.from(infoData.data, 'base64'),
            executable: false, // pode ser que seja executavel
            lamports: +infoData.lamports,
        };
    }

    async getProgramAccounts(
        programId: PublicKey,
        _configOrCommitment?: GetProgramAccountsConfig | Commitment,
    ): Promise<
        Array<{
            pubkey: PublicKey;
            account: AccountInfo<Buffer>;
        }>
    > {
        const baseURL = this.getInspectBaseURL();
        const url = `${baseURL}/programAccounts/${programId.toBase58()}`;
        console.log('Cartesi inspect url', url);
        const resp = await axios.get(url.toString());
        const cartesiResponse = resp.data;
        if (!cartesiResponse.reports || !cartesiResponse.reports.length) {
            //console.log('Fallback to solana getAccountInfo')
            //return super.getAccountInfo(publicKey, commitmentOrConfig);
            return [];
        }
        const accounts = cartesiResponse.reports.map(report => {
            const jsonString = ethers.utils.toUtf8String(report.payload);
            const infoData = JSON.parse(jsonString);
            // console.log({ [publicKey.toBase58()]: infoData })
            return {
                pubkey: new PublicKey(infoData.key),
                account: {
                    owner: new PublicKey(infoData.owner),
                    data: Buffer.from(infoData.data, 'base64'),
                    executable: false, // pode ser que seja executavel
                    lamports: +infoData.lamports,
                }
            };
        })

        return accounts
    }
}

export function convertSolanaAddress2Eth(pubkey: PublicKey) {
    const buffer = pubkey.toBuffer();
    const eth20bytes: number[] = [];
    for (let i = buffer.length - 1; i > 11; i--) {
        eth20bytes.push(buffer[i]);
    }
    const recoveredAddress = ethers.utils.hexValue(eth20bytes);
    return recoveredAddress;
}

export function convertEthAddress2Solana(ethereumAddress: string) {
    const bytes = Buffer.from(ethereumAddress.substring(2), 'hex');
    const sol32bytes: number[] = [];
    for (let i = 0; i < 32; i++) {
        sol32bytes.push(bytes[i] || 0)
    }
    // existe espaco para colocar o byte para recuperar a chave publica original
    const pubkey = PublicKey.decode(Buffer.from(sol32bytes));
    return pubkey;
}

const commitment = 'processed';
const network = clusterApiUrl('devnet');
const cachedConnection = new ConnectionAdapter(network, commitment);

export function getConnection(_commitment) {
    return cachedConnection;
}

export function getProvider(signer?: ethers.Signer) {
    const commitment = 'processed';
    const connection = getConnection(commitment);
    const wallet = new AdaptedWallet();
    const provider = new AnchorProviderAdapter(connection, wallet, { commitment });
    provider.etherSigner = signer;
    return { provider, wallet, connection };
}

export function getProgram<T extends Idl>(signer?: ethers.Signer, idl?: any) {
    const { provider, wallet, connection } = getProvider(signer);
    const programID = new PublicKey(idl.metadata.address);
    const program = new anchor.Program(idl as any, programID, provider) as Program<T>;
    if (signer) {
        (async () => {
            const ethAddress = await signer.getAddress();
            wallet.publicKey = convertEthAddress2Solana(ethAddress);
            connection.wallet = wallet;
            connection.etherSigner = signer;
        })()
    }
    return { program, provider, wallet, connection }
}

export async function getBalanceNFT(signer: ethers.Signer) {
    const contract = new ethers.Contract("0xE6E340D132b5f46d1e472DebcD681B2aBc16e57E", erc1155.abi, signer);
    return await contract.balanceOf(await signer.getAddress(), 1);
}

export async function executeVoucher(signer: ethers.Signer) {
    const { outputContract } = await cartesiRollups(signer);
    const v: OutputValidityProofStruct = {
        epochIndex: "",
        inputIndex: "",
        outputIndex: "",
        outputHashesRootHash: "",
        vouchersEpochRootHash: "",
        noticesEpochRootHash: "",
        machineStateHash: "",
        keccakInHashesSiblings: [],
        outputHashesInEpochSiblings: []
    };
    const contractAddress = "0xE6E340D132b5f46d1e472DebcD681B2aBc16e57E";
    const payload = "0xeacabe14000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb9226600000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000013687474703a2f2f6d79646f6d61696e2e636f6d00000000000000000000000000";
    await outputContract.executeVoucher(contractAddress, payload, v);
}
