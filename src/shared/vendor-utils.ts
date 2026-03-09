import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Markdown + frontmatter parsing
// ---------------------------------------------------------------------------

export interface ParsedMarkdown {
  frontmatter: Record<string, string | undefined>;
  body: string;
}

export function parseMarkdownWithFrontmatter(
  content: string,
): ParsedMarkdown | null {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  if (!match) return null;
  const frontmatterStr = match[1];
  const body = match[2];
  if (frontmatterStr === undefined || body === undefined) return null;
  const frontmatter: Record<string, string | undefined> = {};
  for (const line of frontmatterStr.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;
    const key = trimmed.slice(0, colonIndex).trim();
    let value = trimmed.slice(colonIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value === "[]") value = "";
    frontmatter[key] = value;
  }
  return { frontmatter, body: body.trim() };
}

// ---------------------------------------------------------------------------
// Vendor directory filesystem helpers
// ---------------------------------------------------------------------------

/**
 * Create vendor file helpers scoped to a module's directory.
 * Pass `import.meta.url` from the calling module; vendor files are
 * resolved relative to `<module-dir>/vendor/`.
 */
export function createVendorHelpers(importMetaUrl: string) {
  const vendorDir = path.join(
    path.dirname(fileURLToPath(importMetaUrl)),
    "vendor",
  );

  async function readVendorFile(
    relativePath: string,
  ): Promise<string | null> {
    try {
      return await readFile(path.join(vendorDir, relativePath), "utf-8");
    } catch {
      return null;
    }
  }

  async function listVendorFiles(relativePath: string): Promise<string[]> {
    try {
      return await readdir(path.join(vendorDir, relativePath));
    } catch {
      return [];
    }
  }

  return { vendorDir, readVendorFile, listVendorFiles };
}
