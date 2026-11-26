// Finding and scanning Apex files on disk. The tools only ever read .cls and .trigger
// files, so the MCP server cannot be used to read anything else on the machine.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { parseApex } from "./apex";
import { type Finding, scan } from "./rules";

const APEX_EXT = new Set([".cls", ".trigger"]);
const SKIP_DIRS = new Set(["node_modules", ".git", ".sfdx", ".sf", "dist", ".vscode"]);
const MAX_FILES = 500;
const MAX_FILE_BYTES = 1_000_000;

export interface ApexFileInfo {
  path: string;
  type: "class" | "trigger";
  lines: number;
  is_test: boolean;
}

export function listApexFiles(root: string, base = process.cwd()): ApexFileInfo[] {
  const start = resolve(base, root);
  if (!statSync(start).isDirectory()) throw new Error(`Not a folder: ${root}`);
  const out: ApexFileInfo[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (out.length >= MAX_FILES) return;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
      } else if (APEX_EXT.has(extname(entry.name).toLowerCase())) {
        const raw = readFileSync(full, "utf8");
        const src = parseApex(raw, entry.name);
        out.push({
          path: relative(base, full) || full,
          type: entry.name.toLowerCase().endsWith(".trigger") ? "trigger" : "class",
          lines: src.lineStarts.length,
          is_test: src.isTest,
        });
      }
    }
  };
  walk(start);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export function scanApexFile(path: string, base = process.cwd()): { path: string; is_test: boolean; findings: Finding[] } {
  const full = resolve(base, path);
  if (!APEX_EXT.has(extname(full).toLowerCase())) throw new Error(`Only .cls and .trigger files can be scanned: ${path}`);
  const size = statSync(full).size;
  if (size > MAX_FILE_BYTES) throw new Error(`File is larger than 1 MB: ${path}`);
  const src = parseApex(readFileSync(full, "utf8"), full);
  return { path: relative(base, full) || full, is_test: src.isTest, findings: scan(src) };
}
