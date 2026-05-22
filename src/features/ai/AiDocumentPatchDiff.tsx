import type { AiDocumentPatchPreview } from "./documentPatch";

interface AiDocumentPatchDiffProps {
  preview: AiDocumentPatchPreview;
}

export function AiDocumentPatchDiff({ preview }: AiDocumentPatchDiffProps) {
  return (
    <div className="ai-document-diff" aria-label="AI 修改差异">
      {preview.errors.length ? (
        <div className="ai-document-diff__errors">
          {preview.errors.map((error) => <p key={error}>{error}</p>)}
        </div>
      ) : null}
      <div className="ai-document-diff__body">
        {preview.lines.map((line, index) => (
          <div key={`${line.type}-${index}-${line.text}`} className={`ai-document-diff__line is-${line.type}`}>
            <span>{line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}</span>
            <code>{line.text || " "}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
