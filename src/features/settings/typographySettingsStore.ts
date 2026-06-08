import type { DocumentTypographySettings, GlobalTypographySettings, TypographySettings } from "../../app/appState";

export const supportedDefaultFontSizes = [12, 13, 14, 15, 16, 19, 22, 24] as const;
export const defaultTypographySettings: GlobalTypographySettings = {
  fontFamily: "system-ui",
  defaultFontSize: 19,
};

export function mergeTypographySettings(settings: Partial<GlobalTypographySettings> | null | undefined): GlobalTypographySettings {
  return {
    fontFamily: normalizeFontFamily(settings?.fontFamily) ?? defaultTypographySettings.fontFamily,
    defaultFontSize: normalizeDefaultFontSize(settings?.defaultFontSize) ?? defaultTypographySettings.defaultFontSize,
  };
}

export function mergeDocumentTypographySettings(
  settings: DocumentTypographySettings | null | undefined,
): DocumentTypographySettings {
  return {
    ...(normalizeFontFamily(settings?.fontFamily) ? { fontFamily: normalizeFontFamily(settings?.fontFamily) } : {}),
    ...(normalizeDefaultFontSize(settings?.defaultFontSize) ? { defaultFontSize: normalizeDefaultFontSize(settings?.defaultFontSize) } : {}),
  };
}

export function resolveTypographySettings(
  documentSettings: DocumentTypographySettings | null | undefined,
  globalSettings: GlobalTypographySettings | null | undefined,
): TypographySettings {
  const globalTypography = mergeTypographySettings(globalSettings);
  const documentTypography = mergeDocumentTypographySettings(documentSettings);
  return {
    fontFamily: documentTypography.fontFamily ?? globalTypography.fontFamily,
    defaultFontSize: documentTypography.defaultFontSize ?? globalTypography.defaultFontSize,
  };
}

export function validateTypographySettings(settings: Partial<TypographySettings>): string | null {
  if (!normalizeFontFamily(settings.fontFamily)) {
    return "请填写有效字体";
  }
  if (!normalizeDefaultFontSize(settings.defaultFontSize)) {
    return "请选择支持的字号";
  }
  return null;
}

export function normalizeDefaultFontSize(value: unknown): number | undefined {
  const size = typeof value === "number" ? value : Number(value);
  return supportedDefaultFontSizes.includes(size as typeof supportedDefaultFontSizes[number]) ? size : undefined;
}

export function normalizeFontFamily(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(normalizeFontFamilyPart)
    .filter((part): part is string => Boolean(part))
    .join(", ");

  return normalized || undefined;
}

export function fontFamilyToCss(value: unknown): string {
  return normalizeFontFamily(value) ?? defaultTypographySettings.fontFamily;
}

function normalizeFontFamilyPart(value: string): string | null {
  // 字体名会进入 CSS 变量，这里只允许字体族名称常见字符，避免把任意 CSS 片段写入样式。
  const unquoted = value.replace(/^["']|["']$/g, "").trim();
  if (!unquoted || /[;:{}()\n\r\\]/.test(unquoted)) {
    return null;
  }
  if (!/^[\w\s\u4e00-\u9fa5.-]+$/.test(unquoted)) {
    return null;
  }
  return /\s/.test(unquoted) ? `"${unquoted.replace(/"/g, "")}"` : unquoted;
}
