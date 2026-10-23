use crate::{Diagnostic, SchemaVersion};
use serde_json::Value;
use std::collections::HashSet;

fn path(parent: &str, key: &str) -> String {
    format!("{parent}/{}", key.replace('~', "~0").replace('/', "~1"))
}
fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64() != Some(0.0),
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}
pub(crate) fn array_string(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        Value::Array(a) => a.iter().map(array_string).collect::<Vec<_>>().join(","),
        Value::Object(_) => "[object Object]".into(),
        _ => value.to_string(),
    }
}
// Legacy projects are interpreted as JS Number(schemaVersion), but the raw
// source is never rewritten to this effective version. This is compatibility,
// not permission for a future writer to emit malformed version values.
fn legacy_number(value: Option<&Value>) -> Option<f64> {
    match value? {
        Value::Null => Some(0.0),
        Value::Bool(b) => Some(if *b { 1.0 } else { 0.0 }),
        Value::Number(n) => n.as_f64(),
        Value::String(s) => number_text(s),
        Value::Array(_) => number_text(&array_string(value?)),
        Value::Object(_) => None,
    }
}
fn number_text(s: &str) -> Option<f64> {
    let s = s.trim_matches(|c| matches!(c, '\u{0009}'..='\u{000d}' | ' ' | '\u{00a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'));
    if s.is_empty() {
        return Some(0.0);
    }
    if matches!(s, "Infinity" | "+Infinity") {
        return Some(f64::INFINITY);
    }
    if s == "-Infinity" {
        return Some(f64::NEG_INFINITY);
    }
    for (prefix, radix) in [
        ("0x", 16),
        ("0X", 16),
        ("0b", 2),
        ("0B", 2),
        ("0o", 8),
        ("0O", 8),
    ] {
        if let Some(digits) = s.strip_prefix(prefix) {
            if digits.is_empty() || !digits.chars().all(|c| c.is_digit(radix)) {
                return None;
            }
            return Some(
                u128::from_str_radix(digits, radix)
                    .map(|n| n as f64)
                    .unwrap_or(f64::INFINITY),
            );
        }
    }
    if !s
        .bytes()
        .all(|c| c.is_ascii_digit() || matches!(c, b'e' | b'E' | b'+' | b'-' | b'.'))
        || !s.bytes().any(|c| c.is_ascii_digit())
    {
        return None;
    }
    s.parse::<f64>().ok()
}

struct Check<'a> {
    root: &'a Value,
}
impl Check<'_> {
    fn fail(&self, p: &str, code: &'static str, message: impl Into<String>) -> Diagnostic {
        Diagnostic::at(self.root, p, code, message.into())
    }
    fn object(&self, value: &Value, p: &str, label: &str) -> Result<(), Diagnostic> {
        if !value.is_object() {
            return Err(self.fail(
                p,
                "structure.object",
                format!("Некорректный проект: {label}."),
            ));
        }
        Ok(())
    }
    fn list<'a>(&self, value: &'a Value, p: &str, label: &str) -> Result<&'a [Value], Diagnostic> {
        if value.is_null() {
            return Ok(&[]);
        }
        let array = value.as_array().ok_or_else(|| {
            self.fail(
                p,
                "structure.list",
                format!("Некорректный список: {label}."),
            )
        })?;
        for (i, value) in array.iter().enumerate() {
            if !value.is_object() {
                return Err(self.fail(
                    &path(p, &i.to_string()),
                    "structure.list",
                    format!("Некорректный список: {label}."),
                ));
            }
        }
        Ok(array)
    }
    fn text(&self, value: &Value, p: &str, label: &str) -> Result<(), Diagnostic> {
        if !value.is_null() && !value.is_string() {
            return Err(self.fail(p, "structure.text", format!("Некорректный текст: {label}.")));
        }
        Ok(())
    }
    fn unique(&self, array: &[Value], p: &str, label: &str) -> Result<(), Diagnostic> {
        let mut ids = HashSet::new();
        for (i, value) in array.iter().enumerate() {
            let id = value["id"].as_str();
            if id.is_none_or(|id| id.is_empty() || forbidden(id) || !ids.insert(id)) {
                return Err(self.fail(
                    &path(&path(p, &i.to_string()), "id"),
                    "structure.id",
                    format!("Некорректный или повторный идентификатор: {label}."),
                ));
            }
        }
        Ok(())
    }
    fn condition(&self, root: &Value, p: &str) -> Result<(), Diagnostic> {
        let mut pending = vec![(root, p.to_owned(), 0)];
        let mut count = 0;
        while let Some((value, p, depth)) = pending.pop() {
            if value.is_null() {
                continue;
            }
            self.object(value, &p, "условие")?;
            count += 1;
            if depth > 8 || count > 128 {
                return Err(self.fail(
                    &p,
                    "condition.limit",
                    "Слишком сложное или циклическое условие.",
                ));
            }
            let child_path = path(&p, "conditions");
            for (i, child) in self
                .list(&value["conditions"], &child_path, "условия группы")?
                .iter()
                .enumerate()
                .rev()
            {
                pending.push((child, path(&child_path, &i.to_string()), depth + 1));
            }
        }
        Ok(())
    }
}
fn forbidden(id: &str) -> bool {
    matches!(id, "__proto__" | "constructor" | "prototype")
}
fn invalid_primitive(value: &Value) -> bool {
    match value {
        Value::Object(o) => o.contains_key("toString"),
        Value::Array(a) => a.iter().any(invalid_primitive),
        _ => false,
    }
}

pub(crate) fn validate(project: &Value) -> Result<SchemaVersion, Diagnostic> {
    let c = Check { root: project };
    c.object(project, "", "ожидался объект")?;
    c.object(&project["scenes"], "/scenes", "отсутствует таблица сцен")?;
    if invalid_primitive(&project["schemaVersion"]) {
        return Err(c.fail(
            "/schemaVersion",
            "schema.value",
            "Некорректный формат номера версии проекта.",
        ));
    }
    let version = SchemaVersion::new(legacy_number(project.get("schemaVersion")));
    if version.declared.is_some_and(|n| n > 8.0) {
        return Err(c.fail(
            "/schemaVersion",
            "schema.future",
            "Проект создан более новой версией редактора. Обновите «Историю».",
        ));
    }
    let rpg = &project["rpg"];
    if !rpg.is_null() {
        c.object(rpg, "/rpg", "игровые системы")?;
        if version.lower_than(8) {
            return Err(c.fail(
                "/rpg",
                "schema.rpg",
                "Игровые системы требуют формат проекта 8.",
            ));
        }
        for key in ["skills", "recipes", "locations", "actors"] {
            let p = path("/rpg", key);
            let rows = c.list(&rpg[key], &p, key)?;
            if rows.len() > 500 {
                return Err(c.fail(&p, "rpg.limit", "В игровом списке больше 500 записей."));
            }
        }
    }
    super::ui_shape::validate(project, &project["ui"]["layout"])?;
    if project["ui"]["layout"]["version"].as_f64() == Some(2.0) && version.lower_than(6) {
        return Err(c.fail(
            "/ui/layout/version",
            "schema.ui",
            "Расширенная компоновка интерфейса требует формат проекта 6.",
        ));
    }
    if !project["meta"].is_null() {
        c.object(&project["meta"], "/meta", "настройки")?;
    }
    c.text(&project["meta"]["title"], "/meta/title", "название проекта")?;
    for key in [
        "characters",
        "resources",
        "chapters",
        "variables",
        "flags",
        "items",
    ] {
        c.list(&project[key], &path("", key), key)?;
    }
    let items = c.list(&project["items"], "/items", "items")?;
    c.unique(items, "/items", "предмет инвентаря")?;
    for (i, item) in items.iter().enumerate() {
        let p = path("/items", &i.to_string());
        c.text(
            &item["name"],
            &path(&p, "name"),
            "название предмета инвентаря",
        )?;
        c.text(
            &item["description"],
            &path(&p, "description"),
            "описание предмета инвентаря",
        )?;
    }
    for (id, scene) in project["scenes"].as_object().expect("checked scenes") {
        let p = path("/scenes", id);
        c.object(scene, &p, &format!("сцена {id}"))?;
        c.text(&scene["title"], &path(&p, "title"), "название сцены")?;
        if forbidden(id) || (truthy(&scene["id"]) && scene["id"].as_str() != Some(id)) {
            return Err(c.fail(
                &path(&p, "id"),
                "structure.scene-id",
                "Некорректный идентификатор сцены.",
            ));
        }
        c.list(&scene["characters"], &path(&p, "characters"), "слои сцены")?;
        let image_path = path(&p, "images");
        let images = c.list(&scene["images"], &image_path, "предметные слои")?;
        let action_path = path(&p, "actions");
        let actions = c.list(&scene["actions"], &action_path, "действия")?;
        if images
            .iter()
            .any(|l| l["interactions"].as_array().is_some_and(|a| !a.is_empty()))
        {
            c.unique(images, &image_path, "предметный слой")?;
        }
        for (i, layer) in images.iter().enumerate() {
            let lp = path(&image_path, &i.to_string());
            let rp = path(&lp, "interactions");
            let reactions = c.list(&layer["interactions"], &rp, "реакции предмета")?;
            c.unique(reactions, &rp, "реакция предмета")?;
            if !reactions.is_empty() && layer["id"].as_str().is_none_or(str::is_empty) {
                return Err(c.fail(
                    &path(&lp, "id"),
                    "structure.prop-id",
                    "У интерактивного предмета нет идентификатора.",
                ));
            }
            for (j, reaction) in reactions.iter().enumerate() {
                let p = path(&rp, &j.to_string());
                c.text(&reaction["label"], &path(&p, "label"), "название реакции")?;
                c.text(&reaction["text"], &path(&p, "text"), "ответ предмета")?;
                c.list(
                    &reaction["effects"],
                    &path(&p, "effects"),
                    "результаты реакции",
                )?;
                c.condition(&reaction["condition"], &path(&p, "condition"))?;
            }
        }
        for (i, action) in actions.iter().enumerate() {
            let p = path(&action_path, &i.to_string());
            let kind = action["type"].as_str().ok_or_else(|| {
                c.fail(
                    &path(&p, "type"),
                    "structure.action-type",
                    "У действия не задан тип.",
                )
            })?;
            if kind == "rpg" && version.lower_than(8) {
                return Err(c.fail(
                    &p,
                    "schema.rpg-action",
                    "Игровое действие требует формат проекта 8.",
                ));
            }
            if kind == "keyframes" && version.lower_than(7) {
                return Err(c.fail(
                    &p,
                    "schema.motion",
                    "Ключевые кадры требуют формат проекта 7.",
                ));
            }
            if kind == "keyframes" {
                super::motion_shape::validate(project, scene, action, &p)?;
            }
            c.text(&action["text"], &path(&p, "text"), "реплика")?;
            c.text(&action["prompt"], &path(&p, "prompt"), "вопрос")?;
            c.condition(&action["condition"], &path(&p, "condition"))?;
            let option_path = path(&p, "options");
            for (j, option) in c
                .list(&action["options"], &option_path, "варианты выбора")?
                .iter()
                .enumerate()
            {
                let p = path(&option_path, &j.to_string());
                c.list(
                    &option["effects"],
                    &path(&p, "effects"),
                    "результаты выбора",
                )?;
                c.condition(&option["condition"], &path(&p, "condition"))?;
            }
        }
    }
    for (i, character) in c
        .list(&project["characters"], "/characters", "characters")?
        .iter()
        .enumerate()
    {
        let p = path("/characters", &i.to_string());
        c.text(&character["name"], &path(&p, "name"), "имя персонажа")?;
        c.list(&character["sprites"], &path(&p, "sprites"), "спрайты")?;
    }
    for (i, chapter) in c
        .list(&project["chapters"], "/chapters", "chapters")?
        .iter()
        .enumerate()
    {
        let p = path(&path("/chapters", &i.to_string()), "scenes");
        let scenes = &chapter["scenes"];
        if !scenes.is_null()
            && scenes
                .as_array()
                .is_none_or(|a| a.iter().any(|v| !v.is_string()))
        {
            return Err(c.fail(
                &p,
                "structure.chapter-scenes",
                "Некорректный список сцен главы.",
            ));
        }
    }
    for (i, section) in c
        .list(
            &project["gallery"]["sections"],
            "/gallery/sections",
            "разделы галереи",
        )?
        .iter()
        .enumerate()
    {
        c.list(
            &section["items"],
            &path(&path("/gallery/sections", &i.to_string()), "items"),
            "иллюстрации галереи",
        )?;
    }
    Ok(version)
}
