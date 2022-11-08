import { web3 } from '@project-serum/anchor'
import { useWorkspace } from '@/composables'
import { Tweet } from '@/models'
import { PublicKey } from '@solana/web3.js';

const findTweetAddress = async (author: PublicKey, userTweetId: string, program: any) => {
    const [publicKey, _bump2] = await PublicKey.findProgramAddress([
        author.toBuffer(),
        Buffer.from(userTweetId),
    ], program.programId);
    return { publicKey };
}

export const sendTweet = async (topic, content) => {
    const { wallet, program } = await useWorkspace()
    const userTweetId = Date.now().toString()
    const tweet = await findTweetAddress(wallet.publicKey, userTweetId, program);
    await program.rpc.sendTweet(topic, content, userTweetId, {
        accounts: {
            author: wallet.publicKey,
            tweet: tweet.publicKey,
            systemProgram: web3.SystemProgram.programId,
        },
        signers: []
    })

    const tweetAccount = await program.account.tweet.fetch(tweet.publicKey)
    return new Tweet(tweet.publicKey, tweetAccount)
}
