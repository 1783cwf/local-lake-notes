import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Filter, Kanban, ListFilter, MoreHorizontal, Pencil, Plus, Search, Settings2, Table2, Trash2, X } from "lucide-react";

import type { FileDownloadInput, SaveStatus, UploadImageInput, UploadImageOutput } from "../../app/appState";
import type { WorkspaceDocument } from "../workspace/workspaceStore";
import { documentTitleFromPath } from "../workspace/workspaceStore";
import { useLakeAutosave } from "../lake-editor/useLakeAutosave";
import { MultidimensionalTableBoard } from "./MultidimensionalTableBoard";
import { MultidimensionalTableGrid } from "./MultidimensionalTableGrid";
import {
  createEmptyMultidimensionalTableRecord,
  deleteMultidimensionalRecord,
  formatTimeFieldValue,
  optionById,
  parseMultidimensionalTableDocument,
  serializeMultidimensionalTableDocument,
  type MultidimensionalTableField,
  type MultidimensionalTableDocument,
  type MultidimensionalTableFilterOperator,
  type MultidimensionalTableFilterRule,
  type MultidimensionalTableFieldValue,
  type MultidimensionalTableRecord,
  type MultidimensionalTableView,
} from "./multidimensionalTableDocument";
import { attachmentValues } from "./MultidimensionalTableValueInput";

export interface MultidimensionalTableEditorHandle {
  saveNow: () => Promise<void>;
}

interface MultidimensionalTableEditorProps {
  document: WorkspaceDocument & { kind: "multidimensional-table" };
  content: string;
  manualSaveRequest: number;
  onSave: (relativePath: string, content: string) => Promise<void>;
  onUploadImage?: (input: UploadImageInput) => Promise<UploadImageOutput>;
  onUploadFile?: (input: UploadImageInput) => Promise<UploadImageOutput>;
  onDownloadFile?: (input: FileDownloadInput) => Promise<void>;
  onPrepareResourcePreview?: (resourceRef: string) => Promise<string>;
  onSaveStatusChange: (status: SaveStatus) => void;
  onRegisterSaveNow?: (saveNow: (() => Promise<void>) | null) => void;
}

export const MultidimensionalTableEditor = forwardRef<MultidimensionalTableEditorHandle, MultidimensionalTableEditorProps>(({
  document,
  content,
  manualSaveRequest,
  onSave,
  onUploadImage,
  onUploadFile,
  onDownloadFile,
  onPrepareResourcePreview,
  onSaveStatusChange,
  onRegisterSaveNow,
}, ref) => {
  const documentPath = document.path;
  const [tableDocument, setTableDocument] = useState<MultidimensionalTableDocument>(() => parseMultidimensionalTableDocument(content));
  const [toolbarPanel, setToolbarPanel] = useState<"filter" | "sort" | "search" | null>(null);
  const [searchText, setSearchText] = useState("");
  const [sortFieldId, setSortFieldId] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [boardConfigOpen, setBoardConfigOpen] = useState(false);
  const [viewMenuId, setViewMenuId] = useState<string | null>(null);
  const [renamingViewId, setRenamingViewId] = useState<string | null>(null);
  const [viewNameDraft, setViewNameDraft] = useState("");
  const viewbarSurfaceRef = useRef<HTMLDivElement | null>(null);
  const toolbarSurfaceRef = useRef<HTMLDivElement | null>(null);
  const tableDocumentRef = useRef(tableDocument);
  tableDocumentRef.current = tableDocument;

  useEffect(() => {
    const parsed = parseMultidimensionalTableDocument(content);
    tableDocumentRef.current = parsed;
    setTableDocument(parsed);
    setStatus({ state: "clean" });
  // 这里只在文档路径或初始内容变化时重置 draft；普通输入走本地 state，避免保存状态刷新抢焦点。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, documentPath]);

  const readContent = useCallback(() => serializeMultidimensionalTableDocument(tableDocumentRef.current), []);
  const saveContent = useCallback(async (nextContent: string) => {
    await onSave(documentPath, nextContent);
  }, [documentPath, onSave]);
  const { status, setStatus, scheduleSave, saveNow, saveNowOrThrow } = useLakeAutosave({
    enabled: Boolean(documentPath),
    readContent,
    saveContent,
  });
  const activeView = useMemo(
    () => tableDocument.views.find((view) => view.id === tableDocument.activeViewId) ?? tableDocument.views[0],
    [tableDocument.activeViewId, tableDocument.views],
  );
  const activeViewType = activeView?.type ?? "board";
  const tableView = useMemo(
    () => tableDocument.views.find((view) => view.type === "table"),
    [tableDocument.views],
  );
  const boardViews = useMemo(
    () => tableDocument.views.filter((view) => view.type === "board"),
    [tableDocument.views],
  );
  const activeBoardView = activeView?.type === "board" ? activeView : boardViews[0];
  const boardGroupField = tableDocument.fields.find((field) => field.id === activeBoardView?.groupByFieldId);
  const groupableFields = tableDocument.fields.filter((field) => field.type === "singleSelect");
  const documentTitle = documentTitleFromPath(document.path);
  const tableViewName = tableView?.name ?? "表格";
  const activeFilterRules = activeView?.filterRules ?? [];
  const sortField = tableDocument.fields.find((field) => field.id === sortFieldId);
  const visibleRecords = useMemo(() => {
    return applyRecordViewState(tableDocument.records, tableDocument.fields, {
      searchText,
      filterRules: activeFilterRules,
      sortField,
      sortDirection,
    });
  }, [activeFilterRules, searchText, sortDirection, sortField, tableDocument.fields, tableDocument.records]);
  const activeConditionCount = [
    searchText.trim(),
    activeFilterRules.length > 0,
    sortField,
  ].filter(Boolean).length;

  useImperativeHandle(ref, () => ({ saveNow }), [saveNow]);

  useEffect(() => {
    onSaveStatusChange(status);
  }, [onSaveStatusChange, status]);
  useEffect(() => {
    onRegisterSaveNow?.(saveNowOrThrow);
    return () => onRegisterSaveNow?.(null);
  }, [onRegisterSaveNow, saveNowOrThrow]);
  useEffect(() => {
    if (manualSaveRequest > 0) {
      void saveNow();
    }
  }, [manualSaveRequest, saveNow]);
  useEffect(() => {
    if (!toolbarPanel && !boardConfigOpen) {
      return;
    }

    const closeToolbarPanelsByOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || toolbarSurfaceRef.current?.contains(target)) {
        return;
      }
      setToolbarPanel(null);
      setBoardConfigOpen(false);
    };

    window.document.addEventListener("pointerdown", closeToolbarPanelsByOutsideClick);
    return () => {
      window.document.removeEventListener("pointerdown", closeToolbarPanelsByOutsideClick);
    };
  }, [boardConfigOpen, toolbarPanel]);
  useEffect(() => {
    if (!viewMenuId) {
      return;
    }

    const closeViewMenuByOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || viewbarSurfaceRef.current?.contains(target)) {
        return;
      }
      setViewMenuId(null);
    };

    window.document.addEventListener("pointerdown", closeViewMenuByOutsideClick);
    return () => {
      window.document.removeEventListener("pointerdown", closeViewMenuByOutsideClick);
    };
  }, [viewMenuId]);

  const commitChange = useCallback((nextDocument: MultidimensionalTableDocument) => {
    tableDocumentRef.current = nextDocument;
    setTableDocument(nextDocument);
    scheduleSave();
  }, [scheduleSave]);
  const setActiveViewType = (viewType: "table" | "board") => {
    const nextView = tableDocument.views.find((view) => view.type === viewType);
    if (!nextView) {
      return;
    }
    commitChange({ ...tableDocument, activeViewId: nextView.id });
  };
  const setActiveViewId = (viewId: string) => {
    setViewMenuId(null);
    commitChange({ ...tableDocument, activeViewId: viewId });
  };
  const beginRenameView = (view: MultidimensionalTableView) => {
    setViewMenuId(null);
    setRenamingViewId(view.id);
    setViewNameDraft(view.name);
  };
  const finishRenameView = (viewId: string) => {
    const trimmedName = viewNameDraft.trim();
    const currentDocument = tableDocumentRef.current;
    const targetView = currentDocument.views.find((view) => view.id === viewId);

    setRenamingViewId(null);
    setViewNameDraft("");
    if (!targetView || !trimmedName || targetView.name === trimmedName) {
      return;
    }

    commitChange({
      ...currentDocument,
      views: currentDocument.views.map((view) => view.id === viewId ? { ...view, name: trimmedName } : view),
    });
  };
  const cancelRenameView = () => {
    setRenamingViewId(null);
    setViewNameDraft("");
  };
  const deleteView = (viewId: string) => {
    const currentDocument = tableDocumentRef.current;
    const targetView = currentDocument.views.find((view) => view.id === viewId);
    if (!targetView || !canDeleteView(currentDocument.views, targetView)) {
      return;
    }

    const nextViews = currentDocument.views.filter((view) => view.id !== viewId);
    const nextActiveViewId = currentDocument.activeViewId === viewId
      ? nextViews.find((view) => view.type === targetView.type)?.id ?? nextViews[0]?.id ?? currentDocument.activeViewId
      : currentDocument.activeViewId;

    commitChange({
      ...currentDocument,
      views: nextViews,
      activeViewId: nextActiveViewId,
    });
    setViewMenuId(null);
    cancelRenameView();
  };
  const setBoardGroupField = (fieldId: string) => {
    const currentBoardView = activeBoardView;
    if (!currentBoardView) {
      return;
    }
    commitChange({
      ...tableDocument,
      views: tableDocument.views.map((view) => view.id === currentBoardView.id ? { ...view, groupByFieldId: fieldId } : view),
    });
  };
  const addBoardView = () => {
    const nextBoardView = createBoardView(tableDocument, groupableFields[0]?.id);
    commitChange({
      ...tableDocument,
      views: [...tableDocument.views, nextBoardView],
      activeViewId: nextBoardView.id,
    });
    setViewMenuId(null);
    setToolbarPanel(null);
    setBoardConfigOpen(false);
  };
  const addRecord = useCallback((values: Record<string, MultidimensionalTableFieldValue> = {}) => {
    commitChange({
      ...tableDocumentRef.current,
      records: [
        ...tableDocumentRef.current.records,
        createEmptyMultidimensionalTableRecord(tableDocumentRef.current.fields, values),
      ],
    });
  }, [commitChange]);
  const deleteRecord = useCallback((recordId: string) => {
    commitChange(deleteMultidimensionalRecord(tableDocumentRef.current, recordId));
  }, [commitChange]);
  const setActiveViewFilterRules = useCallback((filterRules: MultidimensionalTableFilterRule[]) => {
    const currentDocument = tableDocumentRef.current;
    const currentActiveViewId = currentDocument.activeViewId;
    commitChange({
      ...currentDocument,
      views: currentDocument.views.map((view) => view.id === currentActiveViewId
        ? { ...view, filterRules: filterRules.length > 0 ? filterRules : undefined }
        : view),
    });
  }, [commitChange]);
  const addFilterRule = useCallback(() => {
    const nextRule = createFilterRule(tableDocumentRef.current.fields);
    if (!nextRule) {
      return;
    }
    const currentView = tableDocumentRef.current.views.find((view) => view.id === tableDocumentRef.current.activeViewId);
    setActiveViewFilterRules([...(currentView?.filterRules ?? []), nextRule]);
  }, [setActiveViewFilterRules]);
  const updateFilterRule = useCallback((ruleId: string, nextRule: MultidimensionalTableFilterRule) => {
    const currentView = tableDocumentRef.current.views.find((view) => view.id === tableDocumentRef.current.activeViewId);
    setActiveViewFilterRules((currentView?.filterRules ?? []).map((rule) => rule.id === ruleId ? nextRule : rule));
  }, [setActiveViewFilterRules]);
  const removeFilterRule = useCallback((ruleId: string) => {
    const currentView = tableDocumentRef.current.views.find((view) => view.id === tableDocumentRef.current.activeViewId);
    setActiveViewFilterRules((currentView?.filterRules ?? []).filter((rule) => rule.id !== ruleId));
  }, [setActiveViewFilterRules]);
  const clearViewConditions = () => {
    setSearchText("");
    setActiveViewFilterRules([]);
    setSortFieldId("");
    setSortDirection("asc");
  };
  const toggleToolbarPanel = (panel: "filter" | "sort" | "search") => {
    setBoardConfigOpen(false);
    setToolbarPanel((current) => current === panel ? null : panel);
  };
  const toggleBoardConfigField = (fieldId: string) => {
    const nextBoardView = activeBoardView;
    if (!nextBoardView) {
      return;
    }
    const currentFieldIds = nextBoardView.cardFieldConfigExplicit && nextBoardView.cardFieldIds
      ? nextBoardView.cardFieldIds
      : defaultBoardCardFieldIds(tableDocument.fields, boardGroupField);
    const nextFieldIds = currentFieldIds.includes(fieldId)
      ? currentFieldIds.filter((currentFieldId) => currentFieldId !== fieldId)
      : [...currentFieldIds, fieldId];
    commitChange({
      ...tableDocument,
      views: tableDocument.views.map((view) => view.id === nextBoardView.id
        ? { ...view, cardFieldIds: nextFieldIds, cardFieldConfigExplicit: true }
        : view),
    });
  };

  return (
    <section className="multitable-editor-root">
      <header className="multitable-shell-header">
        <div ref={viewbarSurfaceRef} className="multitable-viewbar">
          <button type="button" className="multitable-database-tab" aria-label={`${documentTitle} 点击切换视图`}>
            <Table2 size={16} />
            <span>{documentTitle}（点击切换视图）</span>
          </button>
          <div className="multitable-view-switch" role="tablist" aria-label="视图">
            {tableView ? (
              <ViewTab
                view={tableView}
                active={activeView?.id === tableView.id || activeViewType === "table"}
                icon={<Table2 size={16} />}
                label={tableViewName}
                menuOpen={viewMenuId === tableView.id}
                renaming={renamingViewId === tableView.id}
                nameDraft={viewNameDraft}
                canDelete={canDeleteView(tableDocument.views, tableView)}
                onActivate={() => setActiveViewId(tableView.id)}
                onMenuToggle={() => {
                  cancelRenameView();
                  setViewMenuId((current) => current === tableView.id ? null : tableView.id);
                }}
                onRename={() => beginRenameView(tableView)}
                onDelete={() => deleteView(tableView.id)}
                onNameDraftChange={setViewNameDraft}
                onRenameSubmit={() => finishRenameView(tableView.id)}
                onRenameCancel={cancelRenameView}
              />
            ) : (
              <button
                type="button"
                role="tab"
                aria-selected={activeViewType === "table"}
                className="multitable-view-tab__button"
                onClick={() => setActiveViewType("table")}
              >
                <Table2 size={16} />
                {tableViewName}
              </button>
            )}
            {boardViews.map((boardView) => (
              <ViewTab
                key={boardView.id}
                view={boardView}
                active={activeView?.id === boardView.id}
                icon={<Kanban size={16} />}
                label={boardViewName(boardView.name)}
                menuOpen={viewMenuId === boardView.id}
                renaming={renamingViewId === boardView.id}
                nameDraft={viewNameDraft}
                canDelete={canDeleteView(tableDocument.views, boardView)}
                onActivate={() => setActiveViewId(boardView.id)}
                onMenuToggle={() => {
                  cancelRenameView();
                  setViewMenuId((current) => current === boardView.id ? null : boardView.id);
                }}
                onRename={() => beginRenameView(boardView)}
                onDelete={() => deleteView(boardView.id)}
                onNameDraftChange={setViewNameDraft}
                onRenameSubmit={() => finishRenameView(boardView.id)}
                onRenameCancel={cancelRenameView}
              />
            ))}
          </div>
          <button
            type="button"
            className="multitable-viewbar__add"
            aria-label="新增看板"
            onClick={addBoardView}
          >
            <Plus size={16} />
          </button>
        </div>
        <div ref={toolbarSurfaceRef} className="multitable-toolbar-surface">
          <div className="multitable-actionbar">
            <div className="multitable-actionbar__left">
              {activeViewType === "board" ? (
                <>
                  <button
                    type="button"
                    aria-expanded={boardConfigOpen}
                    onClick={() => {
                      setToolbarPanel(null);
                      setBoardConfigOpen((current) => !current);
                    }}
                  >
                    <Settings2 size={16} />
                    看板配置
                  </button>
                  <span className="multitable-actionbar__divider" />
                  <label className="multitable-actionbar__select">
                    <ListFilter size={16} />
                    按
                    <select
                      value={boardGroupField?.id ?? groupableFields[0]?.id ?? ""}
                      aria-label="看板分组字段"
                      onChange={(event) => setBoardGroupField(event.target.value)}
                    >
                      {groupableFields.map((field) => (
                        <option key={field.id} value={field.id}>{field.name}</option>
                      ))}
                    </select>
                    分组
                  </label>
                </>
              ) : null}
              <button type="button" aria-expanded={toolbarPanel === "filter"} onClick={() => toggleToolbarPanel("filter")}>
                <Filter size={16} />
                {activeFilterRules.length > 0 ? `${activeFilterRules.length}个筛选` : "筛选"}
              </button>
              <button type="button" aria-expanded={toolbarPanel === "sort"} onClick={() => toggleToolbarPanel("sort")}>
                <ListFilter size={16} />
                排序
              </button>
              <button type="button" aria-expanded={toolbarPanel === "search"} onClick={() => toggleToolbarPanel("search")}>
                <Search size={16} />
                搜索
              </button>
              {activeConditionCount > 0 ? (
                <button type="button" className="multitable-actionbar__clear" onClick={clearViewConditions}>
                  <X size={15} />
                  清除条件
                </button>
              ) : null}
              <span className="multitable-actionbar__divider" />
              <button type="button" className="multitable-actionbar__primary" onClick={() => addRecord()}>
                <Plus size={16} />
                添加记录
              </button>
            </div>
          </div>
          {boardConfigOpen && activeViewType === "board" ? (
            <BoardConfigPanel
              fields={tableDocument.fields}
              visibleFieldIds={activeBoardView?.cardFieldConfigExplicit && activeBoardView.cardFieldIds
                ? activeBoardView.cardFieldIds
                : defaultBoardCardFieldIds(tableDocument.fields, boardGroupField)}
              onToggleField={toggleBoardConfigField}
            />
          ) : null}
          {toolbarPanel ? (
            <ToolbarPanel
              panel={toolbarPanel}
              fields={tableDocument.fields}
              searchText={searchText}
              filterRules={activeFilterRules}
              sortFieldId={sortFieldId}
              sortDirection={sortDirection}
              onSearchTextChange={setSearchText}
              onAddFilterRule={addFilterRule}
              onUpdateFilterRule={updateFilterRule}
              onRemoveFilterRule={removeFilterRule}
              onClearFilterRules={() => setActiveViewFilterRules([])}
              onSortFieldIdChange={setSortFieldId}
              onSortDirectionChange={setSortDirection}
            />
          ) : null}
        </div>
      </header>
      {activeViewType === "table" ? (
        <MultidimensionalTableGrid
          document={tableDocument}
          records={visibleRecords}
          onChange={commitChange}
          onAddRecord={addRecord}
          onDeleteRecord={deleteRecord}
          onUploadFile={onUploadFile}
          onDownloadFile={onDownloadFile}
        />
      ) : (
        <MultidimensionalTableBoard
          document={tableDocument}
          records={visibleRecords}
          onChange={commitChange}
          onAddRecord={addRecord}
          onDeleteRecord={deleteRecord}
          onUploadImage={onUploadImage}
          onUploadFile={onUploadFile}
          onDownloadFile={onDownloadFile}
          onPrepareResourcePreview={onPrepareResourcePreview}
        />
      )}
    </section>
  );
});

MultidimensionalTableEditor.displayName = "MultidimensionalTableEditor";

function ViewTab({
  view,
  active,
  icon,
  label,
  menuOpen,
  renaming,
  nameDraft,
  canDelete,
  onActivate,
  onMenuToggle,
  onRename,
  onDelete,
  onNameDraftChange,
  onRenameSubmit,
  onRenameCancel,
}: {
  view: MultidimensionalTableView;
  active: boolean;
  icon: ReactNode;
  label: string;
  menuOpen: boolean;
  renaming: boolean;
  nameDraft: string;
  canDelete: boolean;
  onActivate: () => void;
  onMenuToggle: () => void;
  onRename: () => void;
  onDelete: () => void;
  onNameDraftChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
}) {
  const skipBlurSubmitRef = useRef(false);

  return (
    <div className={`multitable-view-tab ${active ? "is-active" : ""}`} role="presentation">
      {renaming ? (
        <form
          className="multitable-view-tab__rename"
          onSubmit={(event) => {
            event.preventDefault();
            onRenameSubmit();
          }}
        >
          <input
            autoFocus
            aria-label={`重命名视图 ${view.name}`}
            value={nameDraft}
            onBlur={() => {
              if (skipBlurSubmitRef.current) {
                skipBlurSubmitRef.current = false;
                return;
              }
              onRenameSubmit();
            }}
            onChange={(event) => onNameDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                skipBlurSubmitRef.current = true;
                onRenameCancel();
              }
            }}
          />
        </form>
      ) : (
        <button
          type="button"
          role="tab"
          aria-selected={active}
          className="multitable-view-tab__button"
          onClick={onActivate}
        >
          {icon}
          <span>{label}</span>
        </button>
      )}
      <button
        type="button"
        className="multitable-view-tab__menu-button"
        aria-label={`${view.name} 视图操作`}
        aria-expanded={menuOpen}
        onClick={onMenuToggle}
      >
        <MoreHorizontal size={15} aria-hidden="true" />
      </button>
      {menuOpen ? (
        <div className="multitable-view-menu" role="menu" aria-label={`${view.name} 视图操作菜单`}>
          <button type="button" role="menuitem" onClick={onRename}>
            <Pencil size={14} aria-hidden="true" />
            重命名
          </button>
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            disabled={!canDelete}
            title={canDelete ? undefined : `至少保留一个${view.type === "board" ? "看板" : "表格"}视图`}
            onClick={onDelete}
          >
            <Trash2 size={14} aria-hidden="true" />
            删除
          </button>
        </div>
      ) : null}
    </div>
  );
}

function BoardConfigPanel({
  fields,
  visibleFieldIds,
  onToggleField,
}: {
  fields: MultidimensionalTableField[];
  visibleFieldIds: string[];
  onToggleField: (fieldId: string) => void;
}) {
  const configurableFields = fields;

  return (
    <div className="multitable-toolbar-panel multitable-board-config-panel" role="region" aria-label="看板字段显示设置">
      <div className="multitable-board-config-panel__intro">
        <strong>卡片字段</strong>
        <span>选择在看板卡片中展示的字段</span>
      </div>
      <div className="multitable-board-config-panel__fields">
        {configurableFields.map((field) => (
          <label key={field.id} className="multitable-board-config-panel__field">
            <input
              type="checkbox"
              checked={visibleFieldIds.includes(field.id)}
              onChange={() => onToggleField(field.id)}
            />
            <span>
              {field.name}
              <small>{fieldTypeText(field)}</small>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ToolbarPanel({
  panel,
  fields,
  searchText,
  filterRules,
  sortFieldId,
  sortDirection,
  onSearchTextChange,
  onAddFilterRule,
  onUpdateFilterRule,
  onRemoveFilterRule,
  onClearFilterRules,
  onSortFieldIdChange,
  onSortDirectionChange,
}: {
  panel: "filter" | "sort" | "search";
  fields: MultidimensionalTableField[];
  searchText: string;
  filterRules: MultidimensionalTableFilterRule[];
  sortFieldId: string;
  sortDirection: "asc" | "desc";
  onSearchTextChange: (value: string) => void;
  onAddFilterRule: () => void;
  onUpdateFilterRule: (ruleId: string, nextRule: MultidimensionalTableFilterRule) => void;
  onRemoveFilterRule: (ruleId: string) => void;
  onClearFilterRules: () => void;
  onSortFieldIdChange: (value: string) => void;
  onSortDirectionChange: (value: "asc" | "desc") => void;
}) {
  return (
    <div
      className={`multitable-toolbar-panel${panel === "filter" ? " multitable-filter-panel" : ""}`}
      role="region"
      aria-label="视图条件"
    >
      {panel === "search" ? (
        <label>
          搜索
          <input
            type="search"
            aria-label="搜索记录"
            placeholder="输入标题、内容、标签或附件名"
            value={searchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
          />
        </label>
      ) : null}
      {panel === "filter" ? (
        <div className="multitable-filter-panel__body">
          {filterRules.map((rule, index) => {
            const field = fields.find((currentField) => currentField.id === rule.fieldId) ?? fields[0];
            if (!field) {
              return null;
            }
            const operators = filterOperatorsForField(field);
            const selectedOperator = operators.some((operator) => operator.operator === rule.operator)
              ? rule.operator
              : defaultFilterOperatorForField(field);
            const needsValue = filterOperatorNeedsValue(selectedOperator);

            return (
              <div key={rule.id} className="multitable-filter-panel__rule">
                <span className="multitable-filter-panel__when">当</span>
                <select
                  aria-label={`筛选字段 ${index + 1}`}
                  value={field?.id ?? ""}
                  onChange={(event) => {
                    const nextField = fields.find((currentField) => currentField.id === event.target.value);
                    if (!nextField) {
                      return;
                    }
                    onUpdateFilterRule(rule.id, {
                      ...rule,
                      fieldId: nextField.id,
                      operator: defaultFilterOperatorForField(nextField),
                      value: "",
                    });
                  }}
                >
                  {fields.map((currentField) => (
                    <option key={currentField.id} value={currentField.id}>{currentField.name}</option>
                  ))}
                </select>
                <select
                  aria-label={`筛选条件 ${index + 1}`}
                  value={selectedOperator}
                  onChange={(event) => {
                    const nextOperator = event.target.value as MultidimensionalTableFilterOperator;
                    onUpdateFilterRule(rule.id, {
                      ...rule,
                      operator: nextOperator,
                      value: filterOperatorNeedsValue(nextOperator) ? rule.value ?? "" : "",
                    });
                  }}
                >
                  {operators.map((operator) => (
                    <option key={operator.operator} value={operator.operator}>{operator.label}</option>
                  ))}
                </select>
                {needsValue ? (
                  <FilterValueControl
                    field={field}
                    rule={rule}
                    index={index}
                    onUpdate={(value) => onUpdateFilterRule(rule.id, { ...rule, operator: selectedOperator, value })}
                  />
                ) : (
                  <div className="multitable-filter-panel__empty-value" aria-hidden="true">无需填写</div>
                )}
                <button
                  type="button"
                  className="multitable-filter-panel__icon-button"
                  aria-label={`删除筛选规则 ${index + 1}`}
                  onClick={() => onRemoveFilterRule(rule.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
          <div className="multitable-filter-panel__actions">
            <button type="button" className="multitable-filter-panel__add" onClick={onAddFilterRule} disabled={fields.length === 0}>
              <Plus size={16} />
              添加筛选规则
            </button>
            {filterRules.length > 0 ? (
              <button type="button" className="multitable-filter-panel__delete" onClick={onClearFilterRules}>
                <Trash2 size={16} />
                删除筛选
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {panel === "sort" ? (
        <>
          <label>
            排序字段
            <select aria-label="排序字段" value={sortFieldId} onChange={(event) => onSortFieldIdChange(event.target.value)}>
              <option value="">不排序</option>
              {fields.map((field) => (
                <option key={field.id} value={field.id}>{field.name}</option>
              ))}
            </select>
          </label>
          <label>
            方向
            <select
              aria-label="排序方向"
              value={sortDirection}
              onChange={(event) => onSortDirectionChange(event.target.value === "desc" ? "desc" : "asc")}
              disabled={!sortFieldId}
            >
              <option value="asc">升序</option>
              <option value="desc">降序</option>
            </select>
          </label>
        </>
      ) : null}
    </div>
  );
}

function FilterValueControl({
  field,
  rule,
  index,
  onUpdate,
}: {
  field: MultidimensionalTableField;
  rule: MultidimensionalTableFilterRule;
  index: number;
  onUpdate: (value: string) => void;
}) {
  if (field.type === "singleSelect" || field.type === "multiSelect") {
    return (
      <select
        aria-label={`筛选值 ${index + 1}`}
        value={rule.value ?? ""}
        onChange={(event) => onUpdate(event.target.value)}
      >
        <option value="">请选择</option>
        {(field.options ?? []).map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
    );
  }

  if (field.type === "time") {
    return (
      <input
        type="date"
        aria-label={`筛选值 ${index + 1}`}
        value={dateInputValue(rule.value ?? "")}
        onChange={(event) => onUpdate(event.target.value)}
      />
    );
  }

  if (field.type === "number" || field.type === "progress") {
    return (
      <input
        type="number"
        aria-label={`筛选值 ${index + 1}`}
        placeholder="请输入数字"
        value={rule.value ?? ""}
        onChange={(event) => onUpdate(event.target.value)}
      />
    );
  }

  return (
    <input
      type="text"
      aria-label={`筛选值 ${index + 1}`}
      placeholder="请输入"
      value={rule.value ?? ""}
      onChange={(event) => onUpdate(event.target.value)}
    />
  );
}

function applyRecordViewState(
  records: MultidimensionalTableRecord[],
  fields: MultidimensionalTableField[],
  state: {
    searchText: string;
    filterRules: MultidimensionalTableFilterRule[];
    sortField?: MultidimensionalTableField;
    sortDirection: "asc" | "desc";
  },
): MultidimensionalTableRecord[] {
  const searchNeedle = normalizeSearchText(state.searchText);
  const searchedRecords = searchNeedle
    ? records.filter((record) => searchableRecordText(record, fields).includes(searchNeedle))
    : records;
  const filteredRecords = state.filterRules.length > 0
    ? searchedRecords.filter((record) => filterRecordByRules(record, fields, state.filterRules))
    : searchedRecords;

  if (!state.sortField) {
    return filteredRecords;
  }

  return [...filteredRecords].sort((leftRecord, rightRecord) => {
    const leftValue = sortableValue(leftRecord, state.sortField!);
    const rightValue = sortableValue(rightRecord, state.sortField!);
    const result = leftValue.localeCompare(rightValue, "zh-Hans-CN", { numeric: true, sensitivity: "base" });
    return state.sortDirection === "asc" ? result : -result;
  });
}

function searchableRecordText(record: MultidimensionalTableRecord, fields: MultidimensionalTableField[]): string {
  return normalizeSearchText([
    record.body ?? "",
    ...fields.map((field) => displayValue(record.values[field.id], field)),
  ].join(" "));
}

function filterRecordByRules(
  record: MultidimensionalTableRecord,
  fields: MultidimensionalTableField[],
  rules: MultidimensionalTableFilterRule[],
): boolean {
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  return rules.every((rule) => {
    const field = fieldById.get(rule.fieldId);
    return field ? filterRecordByRule(record, field, rule) : true;
  });
}

function filterRecordByRule(
  record: MultidimensionalTableRecord,
  field: MultidimensionalTableField,
  rule: MultidimensionalTableFilterRule,
): boolean {
  const value = record.values[field.id];
  if (rule.operator === "isEmpty") {
    return isEmptyFieldValue(value);
  }
  if (rule.operator === "isNotEmpty") {
    return !isEmptyFieldValue(value);
  }
  if (!filterOperatorNeedsValue(rule.operator)) {
    return true;
  }

  if (field.type === "singleSelect") {
    return rule.operator === "isNot" ? value !== rule.value : value === rule.value;
  }
  if (field.type === "multiSelect") {
    const selectedValues = Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
    return rule.operator === "isNot" ? !selectedValues.includes(rule.value ?? "") : selectedValues.includes(rule.value ?? "");
  }
  if (field.type === "number" || field.type === "progress") {
    return compareNumericValue(value, rule);
  }
  if (field.type === "time") {
    return compareTimeValue(value, rule);
  }

  const text = normalizeSearchText(displayValue(value, field));
  const needle = normalizeSearchText(rule.value ?? "");
  if (!needle) {
    return true;
  }
  if (rule.operator === "notContains") {
    return !text.includes(needle);
  }
  if (rule.operator === "startsWith") {
    return text.startsWith(needle);
  }
  if (rule.operator === "notStartsWith") {
    return !text.startsWith(needle);
  }
  if (rule.operator === "endsWith") {
    return text.endsWith(needle);
  }
  if (rule.operator === "notEndsWith") {
    return !text.endsWith(needle);
  }
  if (rule.operator === "is") {
    return text === needle;
  }
  if (rule.operator === "isNot") {
    return text !== needle;
  }
  return text.includes(needle);
}

function compareNumericValue(value: MultidimensionalTableFieldValue | undefined, rule: MultidimensionalTableFilterRule): boolean {
  const currentValue = Number(typeof value === "string" ? value : "");
  const filterValue = Number(rule.value ?? "");
  if (Number.isNaN(currentValue) || Number.isNaN(filterValue)) {
    return false;
  }
  if (rule.operator === "greaterThan") {
    return currentValue > filterValue;
  }
  if (rule.operator === "lessThan") {
    return currentValue < filterValue;
  }
  if (rule.operator === "isNot") {
    return currentValue !== filterValue;
  }
  return currentValue === filterValue;
}

function compareTimeValue(value: MultidimensionalTableFieldValue | undefined, rule: MultidimensionalTableFilterRule): boolean {
  const currentTime = comparableTimeValue(typeof value === "string" ? value : "");
  const filterTime = comparableTimeValue(rule.value ?? "");
  if (currentTime === null || filterTime === null) {
    return false;
  }
  if (rule.operator === "before") {
    return currentTime < filterTime;
  }
  if (rule.operator === "after") {
    return currentTime > filterTime;
  }
  if (rule.operator === "isNot") {
    return currentTime !== filterTime;
  }
  return currentTime === filterTime;
}

function createFilterRule(fields: MultidimensionalTableField[]): MultidimensionalTableFilterRule | null {
  const field = fields[0];
  if (!field) {
    return null;
  }

  return {
    id: createFilterRuleId(),
    fieldId: field.id,
    operator: defaultFilterOperatorForField(field),
    value: "",
  };
}

function createBoardView(
  document: MultidimensionalTableDocument,
  groupByFieldId: string | undefined,
): MultidimensionalTableView {
  const boardViewCount = document.views.filter((view) => view.type === "board").length;
  return {
    id: createViewId(),
    name: `看板 ${boardViewCount + 1}`,
    type: "board",
    groupByFieldId,
    cardFieldIds: defaultBoardCardFieldIds(document.fields, undefined),
  };
}

function createViewId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `view-${crypto.randomUUID()}`;
  }
  return `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createFilterRuleId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `filter-${crypto.randomUUID()}`;
  }
  return `filter-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function filterOperatorsForField(field: MultidimensionalTableField): Array<{
  operator: MultidimensionalTableFilterOperator;
  label: string;
}> {
  if (field.type === "singleSelect" || field.type === "multiSelect") {
    return [
      { operator: "is", label: "是" },
      { operator: "isNot", label: "不是" },
      { operator: "isEmpty", label: "为空" },
      { operator: "isNotEmpty", label: "非空" },
    ];
  }
  if (field.type === "number" || field.type === "progress") {
    return [
      { operator: "equals", label: "等于" },
      { operator: "greaterThan", label: "大于" },
      { operator: "lessThan", label: "小于" },
      { operator: "isEmpty", label: "为空" },
      { operator: "isNotEmpty", label: "非空" },
    ];
  }
  if (field.type === "time") {
    return [
      { operator: "equals", label: "等于" },
      { operator: "before", label: "早于" },
      { operator: "after", label: "晚于" },
      { operator: "isEmpty", label: "为空" },
      { operator: "isNotEmpty", label: "非空" },
    ];
  }

  return [
    { operator: "startsWith", label: "开头是" },
    { operator: "notStartsWith", label: "开头不是" },
    { operator: "endsWith", label: "结尾是" },
    { operator: "notEndsWith", label: "结尾不是" },
    { operator: "contains", label: "包含" },
    { operator: "notContains", label: "不包含" },
    { operator: "is", label: "是" },
    { operator: "isNot", label: "不是" },
    { operator: "isEmpty", label: "为空" },
    { operator: "isNotEmpty", label: "非空" },
  ];
}

function defaultFilterOperatorForField(field: MultidimensionalTableField): MultidimensionalTableFilterOperator {
  if (field.type === "singleSelect" || field.type === "multiSelect") {
    return "is";
  }
  if (field.type === "time" || field.type === "number" || field.type === "progress") {
    return "equals";
  }
  return "contains";
}

function filterOperatorNeedsValue(operator: MultidimensionalTableFilterOperator): boolean {
  return operator !== "isEmpty" && operator !== "isNotEmpty";
}

function comparableTimeValue(value: string): number | null {
  const text = value.trim();
  if (!text) {
    return null;
  }

  const timeOnlyMatch = text.match(/^(\d{1,2}):(\d{1,2})$/);
  if (timeOnlyMatch) {
    const hour = Number(timeOnlyMatch[1]);
    const minute = Number(timeOnlyMatch[2]);
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23 && Number.isInteger(minute) && minute >= 0 && minute <= 59) {
      return hour * 60 + minute;
    }
    return null;
  }

  const normalizedText = text
    .replace(/年|月/g, "-")
    .replace(/日/g, "")
    .replace(/\//g, "-")
    .replace(/\s+/, "T");
  const timestamp = Date.parse(normalizedText);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function dateInputValue(value: string): string {
  const text = value.trim();
  const match = text.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
  if (!match) {
    return "";
  }

  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function isEmptyFieldValue(value: MultidimensionalTableFieldValue | undefined): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return value.trim() === "";
}

function sortableValue(record: MultidimensionalTableRecord, field: MultidimensionalTableField): string {
  const value = record.values[field.id];
  if (field.type === "number" || field.type === "progress") {
    return String(Number(typeof value === "string" ? value : "") || 0).padStart(12, "0");
  }
  if (field.type === "time" && typeof value === "string") {
    const timestamp = comparableTimeValue(value);
    return timestamp === null ? value : String(timestamp).padStart(16, "0");
  }
  return displayValue(value, field);
}

function displayValue(value: MultidimensionalTableFieldValue | undefined, field: MultidimensionalTableField): string {
  if (field.type === "singleSelect") {
    return optionById(field, typeof value === "string" ? value : "")?.label ?? "";
  }
  if (field.type === "multiSelect") {
    const ids = Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
    return ids.map((optionId) => optionById(field, optionId)?.label ?? "").join(" ");
  }
  if (field.type === "attachment") {
    return attachmentValues(value).map((attachment) => attachment.name).join(" ");
  }
  if (field.type === "time") {
    return formatTimeFieldValue(value, field);
  }
  return typeof value === "string" ? value : "";
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase("zh-Hans-CN");
}

function defaultBoardCardFieldIds(
  fields: MultidimensionalTableField[],
  _groupField: MultidimensionalTableField | undefined,
): string[] {
  return fields.map((field) => field.id);
}

function boardViewName(name: string): string {
  return name === "看板" ? "进展看板" : name;
}

function canDeleteView(views: MultidimensionalTableView[], targetView: MultidimensionalTableView): boolean {
  return views.filter((view) => view.type === targetView.type).length > 1;
}

function fieldTypeText(field: MultidimensionalTableField): string {
  if (field.type === "singleSelect") {
    return "单选";
  }
  if (field.type === "multiSelect") {
    return "多选";
  }
  if (field.type === "number") {
    return "数字";
  }
  if (field.type === "progress") {
    return "进度";
  }
  if (field.type === "attachment") {
    return "附件";
  }
  if (field.type === "time") {
    return "时间";
  }
  if (field.type === "url") {
    return "URL";
  }
  return "文本";
}
