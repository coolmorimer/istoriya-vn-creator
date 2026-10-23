use crate::Diagnostic;
use serde_json::Value;
use std::collections::HashSet;

fn path(p: &str, key: &str) -> String {
    format!("{p}/{}", key.replace('~', "~0").replace('/', "~1"))
}
fn fail(root: &Value, p: &str, message: &str) -> Diagnostic {
    Diagnostic::at(root, p, "structure.ui", message.into())
}
pub(crate) fn validate(root: &Value, layout: &Value) -> Result<(), Diagnostic> {
    if layout.is_null() {
        return Ok(());
    }
    let mut pending = vec![(layout, "/ui/layout".to_owned(), 0)];
    let mut count = 0;
    while let Some((value, p, depth)) = pending.pop() {
        if !value.is_object() && !value.is_array() {
            continue;
        }
        count += 1;
        if depth > 8 || count > 512 {
            return Err(fail(root, &p, "Повреждена компоновка интерфейса."));
        }
        let children: Vec<(String, &Value)> = if let Some(o) = value.as_object() {
            o.iter().map(|(k, v)| (k.clone(), v)).collect()
        } else {
            value
                .as_array()
                .unwrap()
                .iter()
                .enumerate()
                .map(|(i, v)| (i.to_string(), v))
                .collect()
        };
        for (key, child) in children.into_iter().rev() {
            let cp = path(&p, &key);
            if matches!(key.as_str(), "__proto__" | "constructor" | "prototype") {
                return Err(fail(root, &cp, "Некорректное поле интерфейса."));
            }
            if matches!(key.as_str(), "visible" | "enabled") && !child.is_boolean() {
                return Err(fail(
                    root,
                    &cp,
                    "Некорректное включение элемента интерфейса.",
                ));
            }
            if matches!(key.as_str(), "label" | "font" | "align") && !child.is_string() {
                return Err(fail(root, &cp, "Некорректный текст элемента интерфейса."));
            }
            if key == "rect"
                && child.as_object().is_none_or(|o| {
                    o.iter().any(|(k, v)| {
                        !matches!(k.as_str(), "x" | "y" | "w" | "h")
                            || v.as_f64().is_none_or(|n| !n.is_finite())
                    })
                })
            {
                return Err(fail(root, &cp, "Некорректная область интерфейса."));
            }
            pending.push((child, cp, depth + 1));
        }
    }
    if !layout.is_object() || !matches!(layout["version"].as_f64(), Some(1.0) | Some(2.0)) {
        return Err(fail(
            root,
            "/ui/layout/version",
            "Неизвестная версия компоновки интерфейса.",
        ));
    }
    for screen in [
        "menu",
        "dialogue",
        "choice",
        "quick",
        "pause",
        "save",
        "load",
        "preferences",
        "history",
        "gallery",
        "notify",
    ] {
        let page = &layout[screen];
        if page.is_null() {
            continue;
        }
        let p = path("/ui/layout", screen);
        if !page.is_object() {
            return Err(fail(root, &p, "Повреждён экран интерфейса."));
        }
        let objects: &[&str] = match screen {
            "menu" => &["title"],
            "dialogue" => &["window", "name", "text", "next", "portrait", "hide"],
            "choice" => &["rect", "button"],
            "quick" => &["rect"],
            "save" | "load" => &["title", "back", "content", "button", "pages"],
            "preferences" => &["title", "back", "content", "button", "options"],
            "notify" => &["content"],
            _ => &["title", "back", "content", "button"],
        };
        for key in objects {
            if let Some(value) = page.get(*key) {
                if !value.is_object() {
                    return Err(fail(root, &path(&p, key), "Повреждён элемент интерфейса."));
                }
            }
        }
        let ids: &[&str] = match screen {
            "menu" => &[
                "start",
                "continue",
                "load",
                "gallery",
                "preferences",
                "about",
                "quit",
            ],
            "pause" => &[
                "save",
                "load",
                "preferences",
                "history",
                "gallery",
                "main_menu",
                "quit",
            ],
            _ => &[],
        };
        if !ids.is_empty() && !page["buttons"].is_null() {
            let mut found = HashSet::new();
            let valid = page["buttons"].as_array().is_some_and(|a| {
                a.len() == ids.len()
                    && a.iter().all(|b| {
                        b.is_object()
                            && b["label"].is_string()
                            && b["id"]
                                .as_str()
                                .is_some_and(|id| ids.contains(&id) && found.insert(id))
                    })
            });
            if !valid {
                return Err(fail(
                    root,
                    &path(&p, "buttons"),
                    if screen == "menu" {
                        "Повреждён список кнопок меню."
                    } else {
                        "Повреждён список кнопок паузы."
                    },
                ));
            }
        }
    }
    Ok(())
}
