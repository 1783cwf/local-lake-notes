import { BookOpen, FolderOpen, Plus, Settings } from "lucide-react";

import { IconButton } from "./IconButton";

interface AppRailProps {
  onChooseWorkspace: () => void;
  onCreateDocument: () => void;
  onOpenSettings: () => void;
}

export function AppRail({ onChooseWorkspace, onCreateDocument, onOpenSettings }: AppRailProps) {
  return (
    <nav className="app-rail" aria-label="应用导航">
      <div className="app-logo" aria-hidden="true">
        <BookOpen size={22} />
      </div>
      <IconButton label="选择目录" onClick={onChooseWorkspace}>
        <FolderOpen size={20} />
      </IconButton>
      <IconButton label="新建文档" onClick={onCreateDocument}>
        <Plus size={20} />
      </IconButton>
      <div className="app-rail__spacer" />
      <IconButton label="设置" onClick={onOpenSettings}>
        <Settings size={20} />
      </IconButton>
    </nav>
  );
}
