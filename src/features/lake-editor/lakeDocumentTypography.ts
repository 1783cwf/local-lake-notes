import type { DocumentTypographySettings, GlobalTypographySettings } from "../../app/appState";
import {
  mergeDocumentTypographySettings,
  mergeTypographySettings,
} from "../settings/typographySettingsStore";

const typographyCommentPattern = /^<!--yuque-lake-notes:typography\s+([\s\S]*?)-->\s*/;

export interface LakeDocumentContentParts {
  body: string;
  documentTypography: DocumentTypographySettings;
  hasDocumentTypography: boolean;
}

export function splitLakeDocumentTypography(content: string): LakeDocumentContentParts {
  const match = content.match(typographyCommentPattern);
  if (!match) {
    return {
      body: content,
      documentTypography: {},
      hasDocumentTypography: false,
    };
  }

  return {
    body: content.slice(match[0].length),
    documentTypography: parseTypographyPayload(match[1]),
    hasDocumentTypography: true,
  };
}

export function composeLakeDocumentWithTypography(
  body: string,
  typography: DocumentTypographySettings | null | undefined,
): string {
  const normalized = mergeDocumentTypographySettings(typography);
  if (!normalized.fontFamily && !normalized.defaultFontSize) {
    return body;
  }

  return `${typographyComment(normalized)}\n${body}`;
}

export function createInitialLakeDocumentContent(
  body: string,
  globalTypography: GlobalTypographySettings | null | undefined,
): string {
  // 新建文档复制当前全局设置为文档级设置；之后全局变化不再隐式改写这篇文档。
  return composeLakeDocumentWithTypography(body, mergeTypographySettings(globalTypography));
}

function parseTypographyPayload(payload: string): DocumentTypographySettings {
  try {
    const parsed = JSON.parse(payload) as DocumentTypographySettings;
    return mergeDocumentTypographySettings(parsed);
  } catch {
    return {};
  }
}

function typographyComment(typography: DocumentTypographySettings): string {
  return `<!--yuque-lake-notes:typography ${JSON.stringify(typography)}-->`;
}
