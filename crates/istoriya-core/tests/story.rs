use istoriya_core::{Destination, ProjectDocument, SceneId, StoryPlan};
use serde_json::{json, Value};

fn fixture() -> Value {
    json!({"schemaVersion":8,"meta":{"title":"QA"},"scenes":{
        "a":{"id":"a","title":"Первая","actions":[]},
        "b":{"id":"b","actions":[]},"c":{"id":"c","actions":[]}},
        "chapters":[{"id":"one","scenes":["a","b"],"entrySceneId":"b"},{"id":"two","scenes":["c"]}]})
}
fn plan(p: &Value) -> Result<StoryPlan<'_>, istoriya_core::Diagnostic> {
    StoryPlan::compile(&ProjectDocument::validate(p).unwrap(), None, None)
}
#[test]
fn chapter_entry_drives_start_and_unique_order_includes_unassigned_scenes() {
    let mut p = fixture();
    p["scenes"]["0"] = json!({"actions":[]});
    p["chapters"][1]["scenes"] = json!(["a", "c"]);
    let before = p.clone();
    let r = plan(&p).unwrap();
    assert_eq!(r.start_scene_id, SceneId("b"));
    assert_eq!(
        r.scene_order,
        vec![SceneId("a"), SceneId("b"), SceneId("c"), SceneId("0")]
    );
    assert_eq!(r.next_scene["c"], Some(SceneId("0")));
    assert_eq!(r.next_scene["0"], None);
    assert_eq!(p, before);
}
#[test]
fn empty_chapters_and_absent_legacy_scene_ids_do_not_invent_or_rewrite_scenes() {
    let p = json!({"scenes":{"z":{"actions":[]},"2":{"actions":[]},"10":{"actions":[]}},"chapters":[{"id":"empty","scenes":[]}]});
    let r = plan(&p).unwrap();
    assert_eq!(r.start_scene_id, SceneId("10"));
    assert!(r.chapter_entries.is_empty());
    assert!(p["scenes"]["10"].get("id").is_none());
}
#[test]
fn unassigned_unicode_order_matches_js_utf16_sort() {
    let p = json!({"scenes":{"\u{e000}":{"actions":[]},"😀":{"actions":[]}},"chapters":[]});
    assert_eq!(plan(&p).unwrap().start_scene_id, SceneId("😀"));
}
#[test]
fn typed_chapter_priority_does_not_confuse_literal_scene_names() {
    let mut p = fixture();
    p["scenes"]["chapter:two"] = json!({"id":"chapter:two","actions":[]});
    p["scenes"]["a"]["actions"] = json!([{"id":"choice","type":"choice","options":[{"targetChapterId":"two","targetSceneId":"gone"},{"targetSceneId":"chapter:two"}]}]);
    let r = plan(&p).unwrap();
    assert!(matches!(
        r.transitions[0].destination,
        Destination::Chapter { .. }
    ));
    assert_eq!(r.transitions[0].destination.scene_id(), SceneId("c"));
    assert!(matches!(
        r.transitions[1].destination,
        Destination::Scene { .. }
    ));
    assert_eq!(
        r.transitions[1].destination.scene_id(),
        SceneId("chapter:two")
    );
}
#[test]
fn condition_branches_props_and_rpg_targets_share_typed_resolution() {
    let mut p = fixture();
    p["scenes"]["a"]["actions"] =
        json!([{"id":"if","type":"condition","trueChapterId":"two","falseSceneId":"b"}]);
    p["scenes"]["a"]["images"] = json!([{"id":"door","interactions":[{"id":"open","targetChapterId":"one"},{"id":"inspect","text":"NARRATIVE_CANARY"}]}]);
    p["rpg"] = json!({"enabled":true,"locations":[{"sceneId":"c"}],"actors":[{"talkSceneId":"b","winSceneId":"c","loseSceneId":"a"}]});
    let r = plan(&p).unwrap();
    assert_eq!(r.transitions.len(), 7);
    assert_eq!(r.transitions[2].destination.scene_id(), SceneId("b"));
    assert!(!serde_json::to_string(&r)
        .unwrap()
        .contains("NARRATIVE_CANARY"));
}
#[test]
fn valid_preview_entry_and_action_are_borrowed_and_stale_requests_fail() {
    let mut p = fixture();
    p["scenes"]["c"]["actions"] = json!([{"id":"line","type":"narration","text":"QA"}]);
    let d = ProjectDocument::validate(&p).unwrap();
    let r = StoryPlan::compile(&d, Some("c"), Some("line")).unwrap();
    assert_eq!(r.start_scene_id, SceneId("c"));
    assert_eq!(r.start_action_id, Some("line"));
    assert_eq!(
        StoryPlan::compile(&d, Some("gone"), None).unwrap_err().code,
        "story.preview-scene-missing"
    );
    assert_eq!(
        StoryPlan::compile(&d, Some("c"), Some("gone"))
            .unwrap_err()
            .pointer,
        "/scenes/c/actions"
    );
}
#[test]
fn unfinished_authoring_is_saveable_but_required_links_block_build_with_an_address() {
    for action in [
        json!({"id":"j","type":"jump"}),
        json!({"id":"j","type":"choice","options":[{}]}),
        json!({"id":"j","type":"condition","trueSceneId":"b"}),
    ] {
        let mut p = fixture();
        p["scenes"]["a"]["actions"] = json!([action]);
        assert!(ProjectDocument::validate(&p).is_ok());
        let e = plan(&p).unwrap_err();
        assert_eq!(e.code, "story.target-empty");
        assert!(e.pointer.starts_with("/scenes/a/actions/0/"));
        assert!(e.to_string().contains("Первая"));
        assert!(e.to_string().contains("шаг 1"));
    }
}
#[test]
fn missing_chapter_cannot_fall_back_to_a_stale_scene_and_empty_choices_fail() {
    let mut p = fixture();
    p["scenes"]["a"]["actions"] =
        json!([{"id":"j","type":"jump","targetChapterId":"gone","targetSceneId":"b"}]);
    assert_eq!(
        plan(&p).unwrap_err().pointer,
        "/scenes/a/actions/0/targetChapterId"
    );
    p["scenes"]["a"]["actions"][0] = json!({"id":"j","type":"choice","options":[]});
    assert_eq!(plan(&p).unwrap_err().code, "story.choice-empty");
}
#[test]
fn chapter_membership_entries_duplicate_ids_and_scene_identity_are_checked() {
    for (path, value, code) in [
        (
            "/chapters/0/scenes/0",
            json!("gone"),
            "story.chapter-scene-missing",
        ),
        (
            "/chapters/0/entrySceneId",
            json!("c"),
            "story.chapter-entry-missing",
        ),
        ("/chapters/1/id", json!("one"), "story.duplicate-chapter"),
    ] {
        let mut p = fixture();
        *p.pointer_mut(path).unwrap() = value;
        let e = plan(&p).unwrap_err();
        assert_eq!(e.code, code);
        assert_eq!(e.pointer, path);
    }
    let mut p = fixture();
    p["scenes"]["a"]["id"] = json!("other");
    assert_eq!(
        ProjectDocument::validate(&p).err().unwrap().code,
        "structure.scene-id"
    );
}
#[test]
fn disabled_timed_links_are_not_executed_but_sequential_steps_still_are() {
    let mut p = fixture();
    p["scenes"]["a"]["timelineEnabled"] = json!(true);
    p["scenes"]["a"]["actions"] =
        json!([{"id":"j","type":"jump","targetSceneId":"gone","timeline":{"enabled":false}}]);
    assert!(plan(&p).is_ok());
    p["scenes"]["a"]["timelineEnabled"] = json!(false);
    assert_eq!(plan(&p).unwrap_err().code, "story.target-scene-missing");
}
#[test]
fn escaped_pointer_and_optional_prop_destination_remain_distinct() {
    let mut p = fixture();
    let a = p["scenes"].as_object_mut().unwrap().remove("a").unwrap();
    p["scenes"]["~/"] = a;
    p["scenes"]["~/"]["id"] = json!("~/");
    p["chapters"][0]["scenes"][0] = json!("~/");
    p["scenes"]["~/"]["images"] =
        json!([{"id":"door","interactions":[{"id":"r","targetSceneId":"gone"}]}]);
    assert_eq!(
        plan(&p).unwrap_err().pointer,
        "/scenes/~0~1/images/0/interactions/0/targetSceneId"
    );
    p["scenes"]["~/"]["images"][0]["interactions"][0]["targetSceneId"] = Value::Null;
    assert!(plan(&p).unwrap().transitions.is_empty());
}
#[test]
fn absent_scenes_and_unresolved_enabled_world_locations_are_blocked() {
    let p = json!({"scenes":{}});
    assert_eq!(plan(&p).unwrap_err().code, "story.no-scenes");
    let mut p = fixture();
    p["rpg"] = json!({"enabled":true,"locations":[{"sceneId":"gone"}]});
    assert_eq!(plan(&p).unwrap_err().pointer, "/rpg/locations/0/sceneId");
    p["rpg"]["enabled"] = json!(false);
    assert!(plan(&p).is_ok());
}
