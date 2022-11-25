import { useWorkspace } from '@/composables'

export const deleteTweet = async (tweet) => {
    const { wallet, program } = useWorkspace()
    console.log({ tweet })
    await program.value.rpc.deleteTweet({
        accounts: {
            author: wallet.value.publicKey,
            tweet: tweet.publicKey,
        },
    })
}
