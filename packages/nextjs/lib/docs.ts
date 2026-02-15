import fs from "fs";
import path from "path";

export const DOCS_DIR = path.join(process.cwd(), "content", "docs");

// Logical reading order — new readers start at the top, deep dives at the bottom.
const DOC_ORDER = [
  "getting-started",
  "architecture",
  "smart-contracts",
  "payment-rails",
  "x402-protocol",
  "oracle-pricing",
  "authentication",
  "chains",
  "testing",
  "roadmap",
];

export type DocEntry = {
  slug: string;
  title: string;
  description: string;
};

function extractTitle(content: string, slug: string): string {
  const firstLine = content.split("\n").find(line => line.startsWith("# "));
  return firstLine ? firstLine.replace(/^#\s+/, "") : slug.replace(/-/g, " ");
}

function extractDescription(content: string): string {
  const lines = content.split("\n");
  // Find the first non-empty paragraph line after the title
  let pastTitle = false;
  for (const line of lines) {
    if (line.startsWith("# ")) {
      pastTitle = true;
      continue;
    }
    if (!pastTitle) continue;
    const trimmed = line.trim();
    // Skip empty lines and headings
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("```") || trimmed.startsWith("|")) continue;
    // Found the first prose paragraph
    return trimmed;
  }
  return "";
}

export function getDocSlugs(): string[] {
  if (!fs.existsSync(DOCS_DIR)) return [];
  const files = fs
    .readdirSync(DOCS_DIR)
    .filter(f => f.endsWith(".md"))
    .map(f => f.replace(/\.md$/, ""));

  return files.sort((a, b) => {
    const ai = DOC_ORDER.indexOf(a);
    const bi = DOC_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
}

export function getDoc(slug: string): string | null {
  const filePath = path.join(DOCS_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf-8");
}

export function getDocTitle(slug: string): string {
  const content = getDoc(slug);
  if (!content) return slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return extractTitle(content, slug);
}

export function getDocs(): DocEntry[] {
  return getDocSlugs().map(slug => {
    try {
      const content = fs.readFileSync(path.join(DOCS_DIR, `${slug}.md`), "utf-8");
      return { slug, title: extractTitle(content, slug), description: extractDescription(content) };
    } catch {
      return { slug, title: slug.replace(/-/g, " "), description: "" };
    }
  });
}
