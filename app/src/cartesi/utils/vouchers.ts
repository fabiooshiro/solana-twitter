import { InputKeys } from "../solana/graphql/reports";
import { getVoucher } from "../solana/graphql/vouchers";
import { ethers, Signer } from "ethers";
import { cartesiRollups } from "./cartesi";
import { OutputValidityProofStruct } from "@cartesi/rollups/dist/src/types/contracts/interfaces/IOutput";
import { createClient, defaultExchanges, gql } from '@urql/core';
import fetch from "cross-fetch";

const VouchersQuery = gql`
  query listVouchers($first: Int, $last: Int, $after: String, $before: String, $where: VoucherFilter) {
    vouchers(first: $first, last: $last, after: $after, before: $before, where: $where) {
        nodes {
            id
            proof {
                outputHashesRootHash
            }
            destination
            payload
        }
        pageInfo {
            startCursor
            endCursor
            hasNextPage
            hasPreviousPage
        }
    }
  }
`;


const DEFAULT_GRAPHQL_URL = 'http://localhost:4000/graphql'

async function getVouchersWithProof(url: string, _inputKeys: InputKeys) {
    const client = createClient({ url, exchanges: defaultExchanges, fetch });
    const result = await client.query(VouchersQuery, {
        //// pagination parameters
        // first: 10,
        // last: 1,
        // after: "1",
        // before: "3",
        // where: {
            //// 2011 nov 22 its not implemented
            // destination: '0x123'
        // }
    }).toPromise();
    return result.data?.vouchers?.nodes || [];
}

function isERC20Transfer(payload: string) {
    // first 4 bytes of keccak 256 hash of ERC-20 transfer method
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
    const vouchers = await getVouchersWithProof(url, inputKeys);

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