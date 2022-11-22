import { InputKeys } from "../solana/graphql/reports";
import { getVoucher, getVouchers } from "../solana/graphql/vouchers";
import { ethers, Signer } from "ethers";
import { cartesiRollups } from "./cartesi";
import { OutputValidityProofStruct } from "@cartesi/rollups/dist/src/types/contracts/interfaces/IOutput";

const DEFAULT_GRAPHQL_URL = 'http://localhost:4000/graphql'

function isERC20Transfer(payload: string) {
    return payload?.startsWith('0xa9059cbb')
}

function decodeERC20Transfer(payload: string) {
    const isTransfer = true;
    const SIGNATURE = 4 * 2 + 2;
    const ADDRESS = 32 * 2;
    const AMOUNT = 32 * 2;
    const iniAmount = SIGNATURE + ADDRESS;
    const endAmount = iniAmount + AMOUNT;
    const hexAmount = payload.substring(iniAmount, endAmount);
    const amount = ethers.BigNumber.from(`0x${hexAmount}`);
    const iniRecipient = SIGNATURE + (12 * 2);
    const endRecipient = iniRecipient + (20 * 2);
    const recipient = '0x' + payload.substring(iniRecipient, endRecipient);
    return {
        isTransfer,
        recipient,
        amount,
    }
}

export async function loadVouchers(url: string, inputKeys: InputKeys) {
    const vouchers = await getVouchers(url, inputKeys);

    return vouchers.map(voucher => {
        let extra: any = {};
        if (isERC20Transfer(voucher.payload)) {
            extra = decodeERC20Transfer(voucher.payload); 
        }
        return { ...voucher, extra };
    });
}

export async function executeVoucher(signer: Signer, id: string, url = DEFAULT_GRAPHQL_URL) {
    const { outputContract } = await cartesiRollups(signer);
    const voucher = await getVoucher(url, id);
    if (!voucher.proof) {
        throw new Error(`Voucher "${id}" has no associated proof yet`);
    }
    const proof: OutputValidityProofStruct = {
        ...voucher.proof,
        epochIndex: voucher.input.epoch.index,
        inputIndex: voucher.input.index,
        outputIndex: voucher.index,
    };
    try {
        // console.log(`Would check: ${JSON.stringify(proof)}`);
        const tx = await outputContract.executeVoucher(
            voucher.destination,
            voucher.payload,
            proof
        );
        const receipt = await tx.wait();
        console.log(`voucher executed! (tx="${tx.hash}")`);
        if (receipt.events) {
            console.log(`resulting events: ${JSON.stringify(receipt.events)}`);
        }
    } catch (e) {
        console.log(`COULD NOT EXECUTE VOUCHER: ${JSON.stringify(e)}`);
        throw e;
    }
}