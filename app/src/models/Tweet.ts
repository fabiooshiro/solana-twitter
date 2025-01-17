import { PublicKey } from "@solana/web3.js"
import dayjs from "dayjs"

export class Tweet {
    publicKey: PublicKey
    author: PublicKey
    timestamp: string
    topic: string
    content: string

    constructor(publicKey: PublicKey, accountData: { author: PublicKey; timestamp: { toString: () => string }; topic: any; content: any }) {
        this.publicKey = publicKey
        this.author = accountData.author
        this.timestamp = accountData.timestamp.toString()
        this.topic = accountData.topic
        this.content = accountData.content
    }

    get key() {
        return this.publicKey.toBase58()
    }

    get author_display() {
        const author = this.author.toBase58()
        return author.slice(0, 4) + '..' + author.slice(-4)
    }

    get created_at() {
        return dayjs.unix(+this.timestamp).format('lll')
    }

    get created_ago() {
        return dayjs.unix(+this.timestamp).fromNow()
    }
}
