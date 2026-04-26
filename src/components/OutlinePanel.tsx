import { ListTree } from "lucide-react";

export function OutlinePanel() {
  return (
    <aside className="outline-panel" aria-label="大纲">
      <div className="outline-panel__header">
        <ListTree size={16} />
        <h2>大纲</h2>
      </div>
      <div className="outline-panel__body">
        <p>由语雀编辑器生成文档结构</p>
      </div>
    </aside>
  );
}
