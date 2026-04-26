export interface LakeOutlineItem {
  id: string;
  level: number;
  text: string;
}

export function extractLakeOutline(content: string): LakeOutlineItem[] {
  if (!content.trim()) {
    return [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<main>${content}</main>`, "text/html");
  return Array.from(doc.querySelectorAll("h1, h2, h3, h4, h5, h6"))
    .map((heading, index) => ({
      id: `heading-${index}`,
      level: Number(heading.tagName.slice(1)),
      text: heading.textContent?.trim() ?? "",
    }))
    .filter((item) => item.text.length > 0);
}
