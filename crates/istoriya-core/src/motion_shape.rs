use crate::Diagnostic;
use serde_json::Value;
use std::collections::HashSet;
fn fail(root: &Value, p: &str, message: &str) -> Diagnostic {
    Diagnostic::at(root, p, "structure.motion", message.into())
}
fn same(a: Option<&Value>, b: Option<&Value>) -> bool {
    match (a, b) {
        (None, None) => true,
        (Some(Value::Number(a)), Some(Value::Number(b))) => a.as_f64() == b.as_f64(),
        (Some(a), Some(b)) if !a.is_object() && !a.is_array() => a == b,
        _ => false,
    }
}
pub(crate) fn validate(
    root: &Value,
    scene: &Value,
    action: &Value,
    p: &str,
) -> Result<(), Diagnostic> {
    let t = &action["target"];
    let target_path = format!("{p}/target");
    match t["kind"].as_str() {
        Some("camera" | "background") => (),
        Some("character") => {
            if !root["characters"]
                .as_array()
                .is_some_and(|a| a.iter().any(|c| same(c.get("id"), t.get("id"))))
            {
                return Err(fail(
                    root,
                    &target_path,
                    "Персонаж движения удалён. Выберите другого.",
                ));
            }
        }
        Some("image") => {
            if !scene["images"]
                .as_array()
                .is_some_and(|a| a.iter().any(|c| same(c.get("id"), t.get("id"))))
            {
                return Err(fail(
                    root,
                    &target_path,
                    "Предмет движения удалён. Выберите другой.",
                ));
            }
        }
        _ => return Err(fail(root, &target_path, "Выберите объект движения.")),
    }
    let frames = action["keyframes"]
        .as_array()
        .filter(|a| (2..=128).contains(&a.len()))
        .ok_or_else(|| {
            fail(
                root,
                &format!("{p}/keyframes"),
                "Нужно от 2 до 128 ключевых кадров.",
            )
        })?;
    let mut ids = HashSet::new();
    let mut previous = -1.0;
    for (i, f) in frames.iter().enumerate() {
        let fp = format!("{p}/keyframes/{i}");
        if !f.is_object() {
            return Err(fail(root, &fp, "Повреждён ключевой кадр."));
        }
        if f["id"]
            .as_str()
            .is_none_or(|id| id.is_empty() || !ids.insert(id))
        {
            return Err(fail(
                root,
                &format!("{fp}/id"),
                "Повторный идентификатор ключевого кадра.",
            ));
        }
        let time = f["time"]
            .as_f64()
            .filter(|n| n.is_finite() && *n >= 0.0 && *n <= 600.0 && *n > previous)
            .ok_or_else(|| {
                fail(
                    root,
                    &format!("{fp}/time"),
                    "Время кадров должно возрастать от 0 до 600 секунд.",
                )
            })?;
        previous = time;
        let easing = &f["easing"];
        let legacy_key = easing
            .is_array()
            .then(|| super::structure::array_string(easing));
        let key = easing.as_str().or(legacy_key.as_deref());
        if !easing.is_null()
            && !key.is_some_and(|e| matches!(e, "linear" | "smooth" | "in" | "out" | "hold"))
        {
            return Err(fail(
                root,
                &format!("{fp}/easing"),
                "Неизвестная плавность движения.",
            ));
        }
        for key in ["x", "y", "scale", "rotation", "opacity"] {
            if f[key].as_f64().is_none_or(|n| {
                !n.is_finite()
                    || n.abs() > 10000.0
                    || (key == "scale" && !(1.0..=2000.0).contains(&n))
                    || (key == "opacity" && !(0.0..=100.0).contains(&n))
            }) {
                return Err(fail(
                    root,
                    &format!("{fp}/{key}"),
                    "Недопустимое значение положения, размера или прозрачности.",
                ));
            }
        }
        if !f["blur"].is_null()
            && f["blur"]
                .as_f64()
                .is_none_or(|n| !n.is_finite() || !(0.0..=100.0).contains(&n))
        {
            return Err(fail(
                root,
                &format!("{fp}/blur"),
                "Размытие должно быть от 0 до 100 пикселей.",
            ));
        }
    }
    if frames[0]["time"].as_f64() != Some(0.0) {
        return Err(fail(
            root,
            &format!("{p}/keyframes/0/time"),
            "Первый ключевой кадр должен начинаться в 0 секунд.",
        ));
    }
    Ok(())
}
