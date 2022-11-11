import { web3 } from '@project-serum/anchor'
import { useWorkspace } from '@/composables'
import { Tweet } from '@/models'
import { PublicKey } from '@solana/web3.js';

const findTweetAddress = async (author: PublicKey, userTweetId: string, program: any) => {
    const [publicKey, _bump2] = await PublicKey.findProgramAddress([
        author.toBuffer(),
        Buffer.from(userTweetId),
    ], program.value.programId);
    return { publicKey };
}

export const sendTweet = async (topic, content) => {
    const { wallet, program } = useWorkspace()
    const userTweetId = Date.now().toString()
    const tweet = await findTweetAddress(wallet.value.publicKey, userTweetId, program);
    await program.value.rpc.sendTweet(topic, content, userTweetId, {
        accounts: {
            author: wallet.value.publicKey,
            tweet: tweet.publicKey,
            systemProgram: web3.SystemProgram.programId,
        },
        signers: []
    })

    const tweetAccount = await program.value.account.tweet.fetch(tweet.publicKey)
    return new Tweet(tweet.publicKey, tweetAccount)
}
