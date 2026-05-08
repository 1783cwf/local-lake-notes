use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Default)]
pub struct AppState {
    workspace_root: Mutex<Option<PathBuf>>,
}

impl AppState {
    pub fn set_workspace_root(&self, root: PathBuf) {
        *self.workspace_root.lock().expect("workspace lock poisoned") = Some(root);
    }

    pub fn clear_workspace_root(&self) {
        *self.workspace_root.lock().expect("workspace lock poisoned") = None;
    }

    pub fn workspace_root(&self) -> Option<PathBuf> {
        self.workspace_root
            .lock()
            .expect("workspace lock poisoned")
            .clone()
    }
}
