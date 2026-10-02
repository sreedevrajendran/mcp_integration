#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CONFIG } from "./config.js";
import { registerGitHubTools } from "./tools/github-tools.js";
import { registerLocalTools } from "./tools/local-tools.js";

async function main() {
  // Ensure critical diagnostic messages only write to stderr to avoid corrupting stdio MCP communication
  console.error("Starting Antigravity & GitHub Bridge MCP Server...");
  console.error(`Antigravity Workspace Directory: ${CONFIG.projectsDir}`);
  console.error(
    `GitHub Personal Access Token: ${CONFIG.githubToken ? "Configured (verified)" : "Not set (set GITHUB_PERSONAL_ACCESS_TOKEN for GitHub operations)"}`
  );

  const server = new McpServer({
    name: "antigravity-github-bridge",
    version: "1.0.0",
  });

  // Register all toolsets
  registerLocalTools(server);
  registerGitHubTools(server);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Antigravity & GitHub Bridge MCP Server running over stdio.");

  // Graceful shutdown handling
  const shutdown = async () => {
    console.error("Shutting down Antigravity & GitHub Bridge MCP Server...");
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Fatal error starting MCP server:", error);
  process.exit(1);
});
