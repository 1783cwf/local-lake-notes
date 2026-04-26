import { ListTree } from "lucide-react";

import type { LakeOutlineItem } from "../features/lake-editor/lakeOutline";

interface OutlinePanelProps {
  items: LakeOutlineItem[];
}

export function OutlinePanel({ items }: OutlinePanelProps) {
  return (
    <aside className="outline-panel" aria-label="大纲">
      <div className="outline-panel__header">
        <ListTree size={16} />
        <h2>大纲</h2>
      </div>
      <div className="outline-panel__body">
        {items.length > 0 ? (
          <nav className="outline-list">
            {items.map((item) => (
              <span key={item.id} className="outline-item" style={{ paddingLeft: `${(item.level - 1) * 12}px` }}>
                {item.text}
              </span>
            ))}
          </nav>
        ) : (
          <p>当前文档还没有标题</p>
        )}
      </div>
    </aside>
  );
}
