//! Developer parity tool, not the game runtime or a user-project writer.
use istoriya_core::ProjectDocument;
use serde_json::{json, Value};
use std::io::{Read, Write};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut input = Vec::new();
    std::io::stdin()
        .take(32 * 1024 * 1024 + 1)
        .read_to_end(&mut input)?;
    if input.len() > 32 * 1024 * 1024 {
        return Err("Contract input is too large".into());
    }
    let cases: Vec<Value> = serde_json::from_slice(&input)?;
    let result: Vec<Value> = cases.iter().map(|case| {
        let project = &case["project"];
        match ProjectDocument::validate(project) {
            Ok(doc) => json!({"name":case["name"],"ok":true,"borrowed":std::ptr::eq(project,doc.value()),"stats":doc.stats(),"roundTrip":serde_json::to_string(doc.value()).expect("JSON document")}),
            Err(diagnostic) => json!({"name":case["name"],"ok":false,"display":diagnostic.to_string(),"diagnostic":diagnostic}),
        }
    }).collect();
    serde_json::to_writer(std::io::stdout().lock(), &result)?;
    std::io::stdout().flush()?;
    Ok(())
}
