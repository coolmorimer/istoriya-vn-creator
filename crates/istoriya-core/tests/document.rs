use istoriya_core::{ChapterId, ProjectDocument, SceneId};
use serde_json::{json, Value};

fn project() -> Value {
    json!({"schemaVersion":8,"meta":{"title":"История"},"scenes":{"s":{"id":"s","title":"Начало","characters":[],"images":[],"actions":[]}},"characters":[],"chapters":[{"id":"chapter","scenes":["s"]}]})
}
#[test]
fn borrowed_model_keeps_literal_text_unknown_fields_and_media_without_cloning() {
    let mut p = project();
    p["futureExtension"] = json!({"opaque":[true,17.125,null]});
    p["resources"] =
        json!([{"id":"media","source":format!("data:image/png;base64,{}","x".repeat(2_000_000))}]);
    p["scenes"]["s"]["actions"] = json!([{"id":"a","type":"narration","text":"C:/буквальный путь [не код] {не шаблон}\n\\x","unknown":{"keep":true}}]);
    let original = p.clone();
    let doc = ProjectDocument::validate(&p).unwrap();
    assert!(std::ptr::eq(doc.value(), &p));
    let scene = doc.scene(SceneId("s")).unwrap();
    assert_eq!(scene.title(), Some("Начало"));
    let action = scene.actions().next().unwrap();
    assert_eq!(action.id(), Some("a"));
    assert_eq!(action.kind(), "narration");
    assert_eq!(action.value()["unknown"]["keep"], true);
    let c = doc.chapters().next().unwrap();
    assert_eq!(c.id(), Some(ChapterId("chapter")));
    assert_eq!(c.scene_ids().collect::<Vec<_>>(), vec![SceneId("s")]);
    assert_eq!(
        serde_json::from_str::<Value>(&serde_json::to_string(doc.value()).unwrap()).unwrap(),
        original
    );
    assert_eq!(doc.stats().actions, 1);
    assert_eq!(doc.stats().scenes, 1);
}
#[test]
fn schema_one_through_eight_and_numeric_strings_do_not_upgrade_the_source() {
    for n in 1..=8 {
        for version in [json!(n), json!(n.to_string())] {
            let mut p = project();
            p["schemaVersion"] = version.clone();
            let doc = ProjectDocument::validate(&p).unwrap();
            assert_eq!(doc.schema().effective(), n);
            assert_eq!(doc.value()["schemaVersion"], version);
        }
    }
    let mut p = project();
    p.as_object_mut().unwrap().remove("schemaVersion");
    assert_eq!(
        ProjectDocument::validate(&p).unwrap().schema().effective(),
        2
    );
    assert!(p.get("schemaVersion").is_none());
}
#[test]
fn future_schema_and_feature_floors_fail_before_any_compilation() {
    let mut p = project();
    p["schemaVersion"] = json!(9);
    assert_eq!(
        ProjectDocument::validate(&p).err().unwrap().pointer,
        "/schemaVersion"
    );
    p["schemaVersion"] = json!(7);
    p["rpg"] = json!({});
    assert_eq!(
        ProjectDocument::validate(&p).err().unwrap().code,
        "schema.rpg"
    );
    p.as_object_mut().unwrap().remove("rpg");
    p["schemaVersion"] = json!(6);
    p["scenes"]["s"]["actions"] = json!([{"type":"keyframes"}]);
    assert_eq!(
        ProjectDocument::validate(&p).err().unwrap().code,
        "schema.motion"
    );
}
#[test]
fn diagnostic_addresses_a_russian_named_scene_and_an_action_without_story_text() {
    let mut p = project();
    p["scenes"]["s"]["actions"] = json!([{"id":"line","type":null,"text":"PRIVATE-LINE-CANARY"}]);
    let d = ProjectDocument::validate(&p).err().unwrap();
    assert_eq!(d.pointer, "/scenes/s/actions/0/type");
    assert_eq!(d.scene_id.as_deref(), Some("s"));
    assert_eq!(d.action_id.as_deref(), Some("line"));
    assert!(d.to_string().contains("Начало»",));
    assert!(d.to_string().contains("шаг 1"));
    assert!(!d.to_string().contains("PRIVATE-LINE-CANARY"));
}
#[test]
fn json_pointer_escapes_ids_instead_of_conflating_nested_scene_names() {
    let mut p = project();
    p["scenes"] = json!({"глава/сцена~1":{"id":"глава/сцена~1","actions":[{"type":4}]}});
    let d = ProjectDocument::validate(&p).err().unwrap();
    assert_eq!(d.pointer, "/scenes/глава~1сцена~01/actions/0/type");
    assert_eq!(d.scene_id.as_deref(), Some("глава/сцена~1"));
    assert_eq!(p.pointer(&d.pointer), Some(&json!(4)));
}
#[test]
fn duplicate_inventory_and_interaction_ids_are_rejected_with_exact_location() {
    let mut p = project();
    p["items"] = json!([{"id":"cup"},{"id":"cup"}]);
    assert_eq!(
        ProjectDocument::validate(&p).err().unwrap().pointer,
        "/items/1/id"
    );
    p["items"] = json!([]);
    p["scenes"]["s"]["images"] =
        json!([{"id":"table","interactions":[{"id":"look"},{"id":"look"}]}]);
    assert_eq!(
        ProjectDocument::validate(&p).err().unwrap().pointer,
        "/scenes/s/images/0/interactions/1/id"
    );
}
#[test]
fn condition_limits_are_per_root_and_use_a_bounded_iterative_walk() {
    let mut p = project();
    let mut c = json!({});
    for _ in 0..9 {
        c = json!({"conditions":[c]});
    }
    p["scenes"]["s"]["actions"] = json!([{"type":"condition","condition":c}]);
    assert_eq!(
        ProjectDocument::validate(&p).err().unwrap().code,
        "condition.limit"
    );
    p["scenes"]["s"]["actions"][0]["condition"] = json!({"conditions":vec![json!({});127]});
    assert!(ProjectDocument::validate(&p).is_ok());
    p["scenes"]["s"]["actions"][0]["condition"]["conditions"]
        .as_array_mut()
        .unwrap()
        .push(json!({}));
    assert!(ProjectDocument::validate(&p).is_err());
}
#[test]
fn unfinished_authoring_links_are_preserved_for_reference_validation_not_hidden_on_load() {
    let mut p = project();
    p["scenes"]["s"]["actions"] =
        json!([{"type":"choice","options":[{"text":"Потом","targetSceneId":"missing-scene"}]}]);
    let doc = ProjectDocument::validate(&p).unwrap();
    assert_eq!(doc.value(), &p);
}
#[test]
fn null_optional_lists_and_legacy_anonymous_noninteractive_layers_remain_readable() {
    let mut p = project();
    p["characters"] = Value::Null;
    p["items"] = Value::Null;
    p["scenes"]["s"]["images"] = json!([{"source":"old.png"}]);
    assert!(ProjectDocument::validate(&p).is_ok());
}
#[test]
fn relative_float_positions_and_negative_out_of_frame_coordinates_are_not_normalized() {
    let mut p = project();
    p["scenes"]["s"]["characters"] = json!([{"x":-120.0,"y":160.0,"scale":37.5}]);
    let doc = ProjectDocument::validate(&p).unwrap();
    assert_eq!(
        doc.value()["scenes"]["s"]["characters"][0]["x"].as_f64(),
        Some(-120.0)
    );
    assert!(doc.value()["scenes"]["s"]["characters"][0]["x"].is_f64());
}
