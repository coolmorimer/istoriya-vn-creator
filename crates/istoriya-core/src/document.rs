use serde::Serialize;
use serde_json::Value;
use std::fmt;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct SceneId<'a>(pub &'a str);
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct ChapterId<'a>(pub &'a str);

#[derive(Clone, Copy, Debug)]
pub struct SchemaVersion {
    effective: u8,
    pub(crate) declared: Option<f64>,
}
impl SchemaVersion {
    pub(crate) fn new(declared: Option<f64>) -> Self {
        let effective = declared
            .filter(|n| *n >= 1.0 && *n <= 8.0 && n.fract() == 0.0)
            .map(|n| n as u8)
            .unwrap_or(2);
        Self {
            effective,
            declared,
        }
    }
    pub fn effective(self) -> u8 {
        self.effective
    }
    pub(crate) fn lower_than(self, version: u8) -> bool {
        self.declared.is_some_and(|n| n < version as f64)
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub code: &'static str,
    pub message: String,
    pub pointer: String,
    pub scene_id: Option<String>,
    pub action_id: Option<String>,
    pub location: String,
}
impl Diagnostic {
    pub(crate) fn at(project: &Value, pointer: &str, code: &'static str, message: String) -> Self {
        let tokens: Vec<String> = pointer
            .split('/')
            .skip(1)
            .map(|s| s.replace("~1", "/").replace("~0", "~"))
            .collect();
        let scene_id = (tokens.first().map(String::as_str) == Some("scenes"))
            .then(|| tokens.get(1).cloned())
            .flatten();
        let mut action_id = None;
        let mut location = match tokens.first().map(String::as_str) {
            Some("meta") => "Настройки проекта".into(),
            Some("characters") => "Персонажи".into(),
            Some("items") => "Инвентарь".into(),
            Some("rpg") => "Игровой мир".into(),
            Some("chapters") => "Главы".into(),
            Some("gallery") => "Галерея".into(),
            Some("resources") => "Ресурсы".into(),
            Some("ui") => "Интерфейс игры".into(),
            _ => "Проект".into(),
        };
        if let Some(id) = &scene_id {
            let scene = &project["scenes"][id];
            let title = scene["title"]
                .as_str()
                .filter(|s| !s.is_empty())
                .unwrap_or(id);
            let title: String = title
                .chars()
                .take(120)
                .map(|c| if c.is_control() { ' ' } else { c })
                .collect();
            location = format!("Сцена «{title}»");
            if tokens.get(2).map(String::as_str) == Some("actions") {
                if let Some(index) = tokens.get(3).and_then(|s| s.parse::<usize>().ok()) {
                    action_id = scene["actions"]
                        .get(index)
                        .and_then(|v| v["id"].as_str())
                        .map(str::to_owned);
                    location.push_str(&format!(", шаг {}", index + 1));
                }
            }
        }
        Self {
            code,
            message,
            pointer: pointer.into(),
            scene_id,
            action_id,
            location,
        }
    }
}
impl fmt::Display for Diagnostic {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.location, self.message)
    }
}
impl std::error::Error for Diagnostic {}

pub struct ProjectDocument<'a> {
    source: &'a Value,
    version: SchemaVersion,
}
impl<'a> ProjectDocument<'a> {
    pub fn validate(source: &'a Value) -> Result<Self, Diagnostic> {
        let version = super::structure::validate(source)?;
        Ok(Self { source, version })
    }
    pub fn value(&self) -> &'a Value {
        self.source
    }
    pub fn schema(&self) -> SchemaVersion {
        self.version
    }
    pub fn scenes(&self) -> impl Iterator<Item = SceneView<'a>> {
        self.source["scenes"]
            .as_object()
            .into_iter()
            .flat_map(|m| m.iter())
            .map(|(id, value)| SceneView {
                id: SceneId(id),
                value,
            })
    }
    pub fn scene(&self, id: SceneId<'_>) -> Option<SceneView<'a>> {
        self.source["scenes"]
            .as_object()?
            .get_key_value(id.0)
            .map(|(id, value)| SceneView {
                id: SceneId(id),
                value,
            })
    }
    pub fn chapters(&self) -> impl Iterator<Item = ChapterView<'a>> {
        values(&self.source["chapters"]).map(|value| ChapterView { value })
    }
    pub fn stats(&self) -> DocumentStats {
        DocumentStats {
            schema: self.version.effective(),
            scenes: self.scenes().count(),
            actions: self.scenes().map(|s| s.actions().count()).sum(),
            chapters: self.chapters().count(),
        }
    }
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentStats {
    pub schema: u8,
    pub scenes: usize,
    pub actions: usize,
    pub chapters: usize,
}

fn values(value: &Value) -> impl Iterator<Item = &Value> {
    value.as_array().into_iter().flat_map(|v| v.iter())
}
#[derive(Clone, Copy)]
pub struct SceneView<'a> {
    pub id: SceneId<'a>,
    value: &'a Value,
}
impl<'a> SceneView<'a> {
    pub fn value(self) -> &'a Value {
        self.value
    }
    pub fn title(self) -> Option<&'a str> {
        self.value["title"].as_str()
    }
    pub fn actions(self) -> impl Iterator<Item = ActionView<'a>> {
        values(&self.value["actions"]).map(|value| ActionView { value })
    }
}
#[derive(Clone, Copy)]
pub struct ActionView<'a> {
    value: &'a Value,
}
impl<'a> ActionView<'a> {
    pub fn value(self) -> &'a Value {
        self.value
    }
    pub fn id(self) -> Option<&'a str> {
        self.value["id"].as_str()
    }
    pub fn kind(self) -> &'a str {
        self.value["type"].as_str().expect("validated action type")
    }
    pub fn text(self) -> Option<&'a str> {
        self.value["text"].as_str()
    }
}
#[derive(Clone, Copy)]
pub struct ChapterView<'a> {
    value: &'a Value,
}
impl<'a> ChapterView<'a> {
    pub fn value(self) -> &'a Value {
        self.value
    }
    pub fn id(self) -> Option<ChapterId<'a>> {
        self.value["id"].as_str().map(ChapterId)
    }
    pub fn scene_ids(self) -> impl Iterator<Item = SceneId<'a>> {
        values(&self.value["scenes"]).filter_map(|v| v.as_str().map(SceneId))
    }
}
