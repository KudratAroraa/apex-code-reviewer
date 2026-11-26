// MCP server for the Apex Code Reviewer plugin.
//
// Claude Code starts this server from the plugin's .mcp.json. It gives Claude three
// tools: find the Apex files, scan one file with the rules, and explain a rule.
// All work happens locally: the code never leaves the developer's machine.
//
// Run `node dist/server.js --scan <folder>` to use the scanner without Claude.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { listApexFiles, scanApexFile } from "./files";
import { RULES, RULES_BY_ID } from "./rules";

const VERSION = "0.2.0";

// Claude Code sets the working directory to the user's project.
const base = () => process.env.CLAUDE_PROJECT_DIR || process.cwd();

// All three tools only read files: they never change anything and never reach outside the project.
const TOOL_HINTS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (err: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }],
});

function createServer() {
  const server = new McpServer({ name: "apex-code-reviewer", version: VERSION });

  server.registerTool(
    "list_apex_files",
    {
      title: "List Apex files",
      description:
        "Find every Apex class (.cls) and trigger (.trigger) under a folder. Returns each file's path, type, line count and whether it is a test class. Call this first to plan the review.",
      inputSchema: { path: z.string().describe("Folder to search, relative to the project root. Use '.' for the whole project.") },
      annotations: TOOL_HINTS,
    },
    async ({ path }) => {
      try {
        const files = listApexFiles(path, base());
        return ok({ folder: path, count: files.length, files });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "scan_apex_file",
    {
      title: "Scan an Apex file",
      description:
        "Run the review rules on one .cls or .trigger file. Returns exact findings with rule ID, severity, line number and the line of code. These are pattern matches: read the code to confirm each one and to look for problems the rules cannot see, such as a query in a helper method that is called from a loop.",
      inputSchema: { path: z.string().describe("Path to a .cls or .trigger file, relative to the project root.") },
      annotations: TOOL_HINTS,
    },
    async ({ path }) => {
      try {
        const result = scanApexFile(path, base());
        return ok({ ...result, count: result.findings.length });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "explain_rule",
    {
      title: "Explain a review rule",
      description: "Get the full explanation and the recommended fix for a rule ID returned by scan_apex_file.",
      inputSchema: { rule_id: z.string().describe(`One of: ${RULES.map((r) => r.id).join(", ")}`) },
      annotations: TOOL_HINTS,
    },
    async ({ rule_id }) => {
      const rule = RULES_BY_ID.get(rule_id);
      if (!rule) return fail(`Unknown rule "${rule_id}". Known rules: ${RULES.map((r) => r.id).join(", ")}`);
      const { check: _check, ...info } = rule;
      return ok(info);
    },
  );

  return server;
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--scan") {
    // Command line mode for quick checks and CI, without Claude.
    const folder = args[1] ?? ".";
    let total = 0;
    for (const f of listApexFiles(folder)) {
      const { findings } = scanApexFile(f.path);
      total += findings.length;
      if (findings.length) console.log(`\n${f.path}`);
      for (const x of findings) console.log(`  line ${String(x.line).padEnd(4)} ${x.severity.padEnd(6)} ${x.rule_id}  ${x.snippet}`);
    }
    console.log(`\n${total} finding(s)`);
    return;
  }
  await createServer().connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
