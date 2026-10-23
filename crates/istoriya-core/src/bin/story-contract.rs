//! Executable navigation parity contract, not the player runtime.
use istoriya_core::{ProjectDocument, StoryPlan};
use serde_json::{json, Value};
use std::io::{Read, Write};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut input = Vec::new();
    std::io::stdin()
        .take(32 * 1024 * 1024 + 1)
        .read_to_end(&mut input)?;
    if input.len() > 32 * 1024 * 1024 {
        return Err("Story contract input too large".into());
    }
    let cases: Vec<Value> = serde_json::from_slice(&input)?;
    let results: Vec<Value> = cases
        .iter()
        .map(|case| {
            let source = &case["project"];
            let result = ProjectDocument::validate(source).and_then(|doc| {
                StoryPlan::compile(
                    &doc,
                    case["startSceneId"].as_str(),
                    case["startActionId"].as_str(),
                )
            });
            match result {
                Ok(plan) => json!({"name":case["name"],"ok":true,"plan":plan}),
                Err(diagnostic) => json!({"name":case["name"],"ok":false,"diagnostic":diagnostic}),
            }
        })
        .collect();
    serde_json::to_writer(std::io::stdout().lock(), &results)?;
    std::io::stdout().flush()?;
    Ok(())
}
