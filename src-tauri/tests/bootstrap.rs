use yuque_lake_notes_lib::state::AppState;

#[test]
fn app_state_starts_without_workspace() {
    let state = AppState::default();

    assert!(state.workspace_root().is_none());
}
