use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_program;

declare_id!("DEVemLxXHPz1tbnBbTVXtvNBHupP2RCBw1jTFN8Uz3FD");

#[program]
pub mod solana_twitter {
    use super::*;
    pub fn send_tweet(
        ctx: Context<SendTweet>,
        content: String,
        _user_tweet_id: String,
    ) -> Result<()> {
        let tweet: &mut Account<Tweet> = &mut ctx.accounts.tweet;
        let author: &Signer = &ctx.accounts.author;
        let clock: Clock = Clock::get().unwrap();

        if content.chars().count() > 280 {
            return Err(ErrorCode::ContentTooLong.into());
        }

        tweet.author = *author.key;
        tweet.timestamp = clock.unix_timestamp;
        tweet.content = content;

        Ok(())
    }

    pub fn update_tweet(ctx: Context<UpdateTweet>, content: String) -> Result<()> {
        let tweet: &mut Account<Tweet> = &mut ctx.accounts.tweet;

        if content.chars().count() > 280 {
            return Err(ErrorCode::ContentTooLong.into());
        }
        if tweet.author.key() != ctx.accounts.author.key() {
            return Err(ErrorCode::Forbidden.into());
        }
        tweet.content = content;

        Ok(())
    }

    pub fn delete_tweet(ctx: Context<DeleteTweet>) -> Result<()> {
        if ctx.accounts.tweet.author.key() != ctx.accounts.author.key() {
            return Err(ErrorCode::Forbidden.into());
        }
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(content: String, user_tweet_id: String)]
pub struct SendTweet<'info> {
    #[account(init, payer = author, space = Tweet::space(&content),
        seeds=[
            author.key().as_ref(),
            &user_tweet_id.as_bytes(),
        ],
        bump,
    )]
    pub tweet: Account<'info, Tweet>,
    #[account(mut)]
    pub author: Signer<'info>,

    /// CHECK: no problem at all
    #[account(address = system_program::ID)]
    pub system_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct UpdateTweet<'info> {
    #[account(mut, has_one = author)]
    pub tweet: Account<'info, Tweet>,
    pub author: Signer<'info>,
}

#[derive(Accounts)]
pub struct DeleteTweet<'info> {
    #[account(mut, has_one = author, close = author)]
    pub tweet: Account<'info, Tweet>,
    pub author: Signer<'info>,
}

#[account]
pub struct Topic {
    pub name: String,

    /// it will be incremented and decremented
    pub count: u32,

    /// <pre>
    /// topic_tweet.index will always be incremented.
    /// When a tweet with topic is older than time X,
    /// we will remove that topic_tweet and increment
    /// the topic.shift and decrement the topic.count
    /// The most recent tweet will be the topic_tweet
    /// with the index = topic.shift + topic.count on
    /// the relation between topic and tweet. Sample:
    /// Let's imagine a topic that count 1k tweets in
    /// 24hs and in the next hour no one tweets about
    /// it, we will delete 1h of expirated tweets and
    /// shift that amount of deleted topic_tweets, so
    /// imagine that in 1h the total expired sums 100
    /// the count will be 900, the shift will be 100.
    /// Of cource the index of the last one will stay
    /// the same, aka must be at index position 1000.
    /// </pre>
    /// ```
    /// topic_tweet.key = PDA(shift + count, topic.name)
    /// ```
    ///
    /// if you wanna find the last N tweets by this topic
    /// ```rust
    /// topic_tweet[0].key = PDA(shift + count - 0, topic.name)
    /// topic_tweet[1].key = PDA(shift + count - 1, topic.name)
    /// topic_tweet[2].key = PDA(shift + count - 2, topic.name)
    /// topic_tweet[3].key = PDA(shift + count - 3, topic.name)
    /// topic_tweet[N].key = PDA(shift + count - N, topic.name)
    /// ```
    pub shift: u32,
}

#[account]
pub struct TopicTweet {
    /// PDA item
    pub index: u32,

    /// PDA item
    pub topic: String,

    /// Data
    pub tweet: Pubkey,
}

#[account]
pub struct Tweet {
    pub author: Pubkey,
    pub timestamp: i64,

    /// retweets will have a header
    /// retweet from account_info.key
    /// reply to account_info.key
    pub header: String,

    pub content: String,

    /// It's unique per the author pubkey
    pub id: u64,
    pub likes: u32,
    pub retweets: u32,
}

#[account]
pub struct Author {
    pub pubkey: Pubkey,
    pub slug: String,

    /// It's the sequence for tweet.id
    /// also is the total count of tweets (deleted still count)
    pub tweets: u64,
}

const DISCRIMINATOR_LENGTH: usize = 8;
const PUBLIC_KEY_LENGTH: usize = 32;
const TIMESTAMP_LENGTH: usize = 8;
const STRING_LENGTH_PREFIX: usize = 4; // Stores the size of the string.

impl Tweet {
    const LEN: usize = DISCRIMINATOR_LENGTH
        + PUBLIC_KEY_LENGTH // Author.
        + TIMESTAMP_LENGTH // Timestamp.
        + STRING_LENGTH_PREFIX; // Content.

    pub fn space(content: &String) -> usize {
        Tweet::LEN + content.len()
    }
}

#[error_code]
pub enum ErrorCode {
    #[msg("The provided topic should be 50 characters long maximum.")]
    TopicTooLong,
    #[msg("The provided content should be 280 characters long maximum.")]
    ContentTooLong,
    #[msg("Forbidden")]
    Forbidden,
}
