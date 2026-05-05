use yuque_lake_notes_lib::state::AppState;

#[test]
fn app_state_starts_without_workspace() {
    let state = AppState::default();

    assert!(state.workspace_root().is_none());
}

#[test]
fn tauri_asset_protocol_allows_resource_cache_only() {
    let config = serde_json::from_str::<serde_json::Value>(include_str!("../tauri.conf.json"))
        .expect("tauri config should be valid json");
    let asset_protocol = &config["app"]["security"]["assetProtocol"];

    assert_eq!(asset_protocol["enable"], true);
    assert_eq!(
        asset_protocol["scope"]
            .as_array()
            .expect("asset protocol scope should be an array"),
        &[serde_json::Value::String(
            "$APPCACHE/resource-cache/**".to_string()
        )]
    );
}
