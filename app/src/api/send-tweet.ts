import { web3 } from '@project-serum/anchor'
import { useWorkspace } from '@/composables'
import { Tweet } from '@/models'

export const sendTweet = async (topic, content) => {
    const { wallet, program } = await useWorkspace()
    const tweet = web3.Keypair.generate()

    await program.rpc.sendTweet(topic, content, {
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
