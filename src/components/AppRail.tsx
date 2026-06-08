import { BookOpen, Plus, Settings } from "lucide-react";

import type { DocumentTabGroup } from "../app/appState";
import type { KnownWorkspace } from "../features/workspace/workspaceStore";
import { DocumentTabGroupSwitcher } from "./DocumentTabGroupSwitcher";
import { IconButton } from "./IconButton";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

interface AppRailProps {
  activeWorkspaceRoot?: string | null;
  knownWorkspaces?: KnownWorkspace[];
  onChooseWorkspace: () => void;
  onCreateWorkspace?: () => void;
  onSwitchWorkspace?: (root: string) => void;
  onForgetWorkspace?: (root: string) => void;
  onCreateDocument: () => void;
  tabGroups?: DocumentTabGroup[];
  lockedTabCount?: number;
  onSaveCurrentTabGroup?: (name: string) => void;
  onOpenTabGroup?: (groupId: string) => void;
  onDeleteTabGroup?: (groupId: string) => void;
  onOpenSettings: () => void;
}

export function AppRail({
  activeWorkspaceRoot = null,
  knownWorkspaces = [],
  onChooseWorkspace,
  onCreateWorkspace = onChooseWorkspace,
  onSwitchWorkspace = () => {},
  onForgetWorkspace = () => {},
  onCreateDocument,
  tabGroups = [],
  lockedTabCount = 0,
  onSaveCurrentTabGroup = () => {},
  onOpenTabGroup = () => {},
  onDeleteTabGroup = () => {},
  onOpenSettings,
}: AppRailProps) {
  return (
    <nav className="app-rail" aria-label="应用导航">
      <div className="app-logo" aria-hidden="true">
        <BookOpen size={22} />
      </div>
      <IconButton label="新建文档" onClick={onCreateDocument}>
        <Plus size={20} />
      </IconButton>
      <DocumentTabGroupSwitcher
        groups={tabGroups}
        lockedTabCount={lockedTabCount}
        onSaveCurrentGroup={onSaveCurrentTabGroup}
        onOpenGroup={onOpenTabGroup}
        onDeleteGroup={onDeleteTabGroup}
      />
      <div className="app-rail__spacer" />
      <WorkspaceSwitcher
        activeWorkspaceRoot={activeWorkspaceRoot}
        knownWorkspaces={knownWorkspaces}
        onChooseWorkspace={onChooseWorkspace}
        onCreateWorkspace={onCreateWorkspace}
        onSwitchWorkspace={onSwitchWorkspace}
        onForgetWorkspace={onForgetWorkspace}
      />
      <IconButton label="设置" onClick={onOpenSettings}>
        <Settings size={20} />
      </IconButton>
    </nav>
  );
}
