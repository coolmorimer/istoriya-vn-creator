//! Rust-owned engine pipeline. Source emission is the remaining JS boundary;
//! SDK processes, official GUI generation and artifact publication live here.
mod build;
mod process;
mod preview;

pub use build::execute;
pub use preview::reap_abandoned;
