//! Typed, media-free navigation plan. Authoring documents remain unchanged;
//! linking is a separate build gate, never a restriction on saving drafts.
use crate::{ChapterId, Diagnostic, ProjectDocument, SceneId};
use serde::Serialize;
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};

pub const STORY_PROTOCOL: u32 = 1;

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Destination<'a> {
    Scene {
        #[serde(rename = "sceneId")]
        scene_id: SceneId<'a>,
    },
    Chapter {
        #[serde(rename = "chapterId")]
        chapter_id: ChapterId<'a>,
        #[serde(rename = "sceneId")]
        scene_id: SceneId<'a>,
    },
}
impl<'a> Destination<'a> {
    pub fn scene_id(&self) -> SceneId<'a> {
        match self {
            Self::Scene { scene_id } | Self::Chapter { scene_id, .. } => *scene_id,
        }
    }
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transition<'a> {
    pub pointer: String,
    pub destination: Destination<'a>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryPlan<'a> {
    pub protocol: u32,
    pub start_scene_id: SceneId<'a>,
    pub start_action_id: Option<&'a str>,
    pub scene_order: Vec<SceneId<'a>>,
    pub chapter_entries: BTreeMap<&'a str, SceneId<'a>>,
    pub next_scene: BTreeMap<&'a str, Option<SceneId<'a>>>,
    pub transitions: Vec<Transition<'a>>,
}

fn array(v: &Value) -> &[Value] {
    v.as_array().map(Vec::as_slice).unwrap_or(&[])
}
fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(v) => *v,
        Value::Number(v) => v.as_f64() != Some(0.0),
        Value::String(v) => !v.is_empty(),
        _ => true,
    }
}
fn pointer(base: &str, key: &str) -> String {
    format!("{base}/{}", key.replace('~', "~0").replace('/', "~1"))
}
fn fail(project: &Value, path: &str, code: &'static str, message: &str) -> Diagnostic {
    Diagnostic::at(project, path, code, message.into())
}

impl<'a> StoryPlan<'a> {
    pub fn compile(
        document: &ProjectDocument<'a>,
        start_scene: Option<&str>,
        start_action: Option<&str>,
    ) -> Result<Self, Diagnostic> {
        let project = document.value();
        let scenes = project["scenes"]
            .as_object()
            .expect("validated scene table");
        if scenes.is_empty() {
            return Err(fail(
                project,
                "/scenes",
                "story.no-scenes",
                "Добавьте хотя бы одну сцену.",
            ));
        }
        let mut order = Vec::new();
        let mut seen = HashSet::new();
        let mut chapters = HashSet::new();
        let mut chapter_entries = BTreeMap::new();
        let mut first_entry = None;
        for (index, chapter) in array(&project["chapters"]).iter().enumerate() {
            let base = format!("/chapters/{index}");
            let id = chapter["id"].as_str().filter(|s| !s.is_empty());
            if let Some(id) = id {
                if !chapters.insert(id) {
                    return Err(fail(
                        project,
                        &pointer(&base, "id"),
                        "story.duplicate-chapter",
                        "У двух глав одинаковый ID. Исправьте повтор перед сборкой.",
                    ));
                }
            }
            let members = array(&chapter["scenes"]);
            for (i, member) in members.iter().enumerate() {
                let name = member.as_str().expect("validated chapter member");
                let Some((name, _)) = scenes.get_key_value(name) else {
                    return Err(fail(project, &format!("{base}/scenes/{i}"), "story.chapter-scene-missing", "В списке главы находится удалённая сцена. Восстановите её или уберите из главы."));
                };
                if seen.insert(name.as_str()) {
                    order.push(SceneId(name));
                }
            }
            let entry = if truthy(&chapter["entrySceneId"]) {
                let entry = chapter["entrySceneId"]
                    .as_str()
                    .filter(|s| members.iter().any(|v| v.as_str() == Some(*s)));
                let Some((name, _)) = entry.and_then(|s| scenes.get_key_value(s)) else {
                    return Err(fail(project, &pointer(&base, "entrySceneId"), "story.chapter-entry-missing", "Входная сцена главы отсутствует или принадлежит другой главе. Выберите вход заново."));
                };
                Some(SceneId(name))
            } else {
                members
                    .first()
                    .and_then(Value::as_str)
                    .and_then(|s| scenes.get_key_value(s))
                    .map(|(id, _)| SceneId(id))
            };
            if let Some(entry) = entry {
                if first_entry.is_none() {
                    first_entry = Some(entry);
                }
                if let Some(id) = id {
                    chapter_entries.insert(id, entry);
                }
            }
        }
        // JSON object ordering must not decide normal story order. Chapters are
        // authoritative; unassigned scenes follow in deterministic key order.
        let mut extra: Vec<_> = scenes
            .keys()
            .filter(|id| !seen.contains(id.as_str()))
            .collect();
        extra.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
        order.extend(extra.into_iter().map(|id| SceneId(id)));
        let start_scene_id = if let Some(id) = start_scene.filter(|s| !s.is_empty()) {
            let Some((id, _)) = scenes.get_key_value(id) else {
                return Err(fail(
                    project,
                    "/scenes",
                    "story.preview-scene-missing",
                    "Сцена запуска удалена. Выберите существующую сцену.",
                ));
            };
            SceneId(id)
        } else {
            first_entry.unwrap_or(order[0])
        };
        let start_action_id = if let Some(id) = start_action.filter(|s| !s.is_empty()) {
            let Some(action) = array(&scenes[start_scene_id.0]["actions"])
                .iter()
                .find(|a| a["id"].as_str() == Some(id))
            else {
                return Err(fail(
                    project,
                    &pointer(&pointer("/scenes", start_scene_id.0), "actions"),
                    "story.preview-action-missing",
                    "Шаг запуска удалён. Выберите существующий шаг.",
                ));
            };
            action["id"].as_str()
        } else {
            None
        };
        let next_scene = order
            .iter()
            .enumerate()
            .map(|(i, id)| (id.0, order.get(i + 1).copied()))
            .collect();
        let mut plan = Self {
            protocol: STORY_PROTOCOL,
            start_scene_id,
            start_action_id,
            scene_order: order,
            chapter_entries,
            next_scene,
            transitions: Vec::new(),
        };
        for (id, scene) in scenes {
            let base = pointer("/scenes", id);
            for (i, action) in array(&scene["actions"]).iter().enumerate() {
                if truthy(&scene["timelineEnabled"]) && action["timeline"]["enabled"] == false {
                    continue;
                }
                let p = format!("{base}/actions/{i}");
                match action["type"].as_str() {
                    Some("jump") => plan.link(project, action, &p, "targetSceneId", true)?,
                    Some("condition") => {
                        plan.link(project, action, &p, "trueSceneId", true)?;
                        plan.link(project, action, &p, "falseSceneId", true)?;
                    }
                    Some("choice") => {
                        if array(&action["options"]).is_empty() {
                            return Err(fail(
                                project,
                                &pointer(&p, "options"),
                                "story.choice-empty",
                                "Добавьте хотя бы один вариант выбора.",
                            ));
                        }
                        for (j, option) in array(&action["options"]).iter().enumerate() {
                            plan.link(
                                project,
                                option,
                                &format!("{p}/options/{j}"),
                                "targetSceneId",
                                true,
                            )?;
                        }
                    }
                    _ => (),
                }
            }
            for (i, layer) in array(&scene["images"]).iter().enumerate() {
                for (j, reaction) in array(&layer["interactions"]).iter().enumerate() {
                    plan.link(
                        project,
                        reaction,
                        &format!("{base}/images/{i}/interactions/{j}"),
                        "targetSceneId",
                        false,
                    )?;
                }
            }
        }
        if project["rpg"]["enabled"] == true {
            for (i, location) in array(&project["rpg"]["locations"]).iter().enumerate() {
                plan.link(
                    project,
                    location,
                    &format!("/rpg/locations/{i}"),
                    "sceneId",
                    true,
                )?;
            }
            for (i, actor) in array(&project["rpg"]["actors"]).iter().enumerate() {
                for field in ["talkSceneId", "winSceneId", "loseSceneId"] {
                    plan.link(project, actor, &format!("/rpg/actors/{i}"), field, false)?;
                }
            }
        }
        Ok(plan)
    }
    fn link(
        &mut self,
        project: &'a Value,
        record: &'a Value,
        base: &str,
        field: &str,
        required: bool,
    ) -> Result<(), Diagnostic> {
        let chapter_field = field.replace("SceneId", "ChapterId");
        // sceneId on a world location is intentionally scene-only.
        let destination = if chapter_field != field && truthy(&record[&chapter_field]) {
            let id = record[&chapter_field].as_str();
            let Some((id, scene_id)) = id.and_then(|id| self.chapter_entries.get_key_value(id))
            else {
                return Err(fail(project, &pointer(base, &chapter_field), "story.target-chapter-missing", "Глава перехода удалена или не содержит входной сцены. Выберите назначение заново."));
            };
            Destination::Chapter {
                chapter_id: ChapterId(*id),
                scene_id: *scene_id,
            }
        } else if truthy(&record[field]) {
            let id = record[field].as_str();
            let Some((id, _)) = id.and_then(|id| project["scenes"].as_object()?.get_key_value(id))
            else {
                return Err(fail(
                    project,
                    &pointer(base, field),
                    "story.target-scene-missing",
                    "Сцена перехода удалена. Выберите существующую сцену.",
                ));
            };
            Destination::Scene {
                scene_id: SceneId(id),
            }
        } else if required {
            return Err(fail(
                project,
                &pointer(base, field),
                "story.target-empty",
                "Укажите сцену или главу перехода.",
            ));
        } else {
            return Ok(());
        };
        self.transitions.push(Transition {
            pointer: pointer(base, field),
            destination,
        });
        Ok(())
    }
}
