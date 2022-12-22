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
