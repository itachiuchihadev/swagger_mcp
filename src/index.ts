#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./core/config.js";
import { createServer } from "./server.js";

/**
 * Entry point for the swagger-mcp server.
 *
 * Loads configuration, creates the MCP server, and connects it
 * to stdio transport for communication with MCP clients.
 */
async function main(): Promise<void> {
  console.error("[swagger-mcp] Starting...");

  // Load configuration from env vars and CLI args
  const config = loadConfig();
  console.error(`[swagger-mcp] Spec URL: ${config.specUrl}`);

  try {
    // Create the MCP server (fetches spec, builds tools)
    const server = await createServer(config);

    // Connect via stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("[swagger-mcp] Server is running. Waiting for requests...");

    // Handle graceful shutdown
    const shutdown = async () => {
      console.error("[swagger-mcp] Shutting down...");
      await server.close();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[swagger-mcp] Fatal error: ${message}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Safety nets for unhandled errors in the stdio server process
process.on("unhandledRejection", (reason) => {
  console.error("[swagger-mcp] Unhandled rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[swagger-mcp] Uncaught exception:", error);
  process.exit(1);
});

main();
