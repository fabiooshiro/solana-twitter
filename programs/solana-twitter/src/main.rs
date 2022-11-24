use std::io;

use cartesi_solana::adapter::call_solana_program;
use solana_twitter::entry;


fn main() -> io::Result<()> {
    call_solana_program(entry)?;
    Ok(())
}
