//! Shared, platform-independent engine data. No Tauri, Node, Python or filesystem.
//! Validated views borrow the original JSON: unknown fields, legacy values and
//! media bodies are not cloned, normalized away or serialized with defaults.
mod document;
mod motion_shape;
mod structure;
mod ui_shape;

pub use document::{
    ActionView, ChapterId, ChapterView, Diagnostic, DocumentStats, ProjectDocument, SceneId,
    SceneView, SchemaVersion,
};
pub const STRUCTURE_PROTOCOL: u32 = 1;
