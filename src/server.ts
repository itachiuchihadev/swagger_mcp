import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ServerConfig, ToolMapping } from "./core/types.js";
import { parseSwaggerSpec } from "./parser/swagger-parser.js";
import { buildTools, McpToolDefinition } from "./parser/tool-builder.js";
import { executeToolRequest } from "./http/request-handler.js";

/**
 * Creates and configures the MCP server.
 *
 * Flow:
 * 1. Fetch & parse the Swagger spec
 * 2. Resolve the base URL (config → spec → spec URL origin)
 * 3. Generate MCP tool definitions from operations
 * 4. Register ListTools and CallTool handlers
 */
export async function createServer(config: ServerConfig): Promise<Server> {
  // ─── Parse the spec ─────────────────────────────────────────────────
  let tools: McpToolDefinition[];
  let mappings: Map<string, ToolMapping>;
  let baseUrl: string;
  let apiTitle: string;

  const result = await loadSpec(config);
  tools = result.tools;
  mappings = result.mappings;
  baseUrl = result.baseUrl;
  apiTitle = result.apiTitle;

  // ─── Create MCP server ─────────────────────────────────────────────
  const server = new Server(
    {
      name: `swagger-mcp: ${apiTitle}`,
      version: "1.0.0",
    },
    {
      capabilities: { tools: {} },
    }
  );

  // ─── ListTools handler ─────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Include the reload meta-tool
    const allTools: McpToolDefinition[] = [
      ...tools,
      {
        name: "_swagger_mcp_reload",
        description:
          "Re-fetches and re-parses the Swagger/OpenAPI spec to update all tools. " +
          "Use this if the API spec has changed and you want to pick up new endpoints.",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
    ];

    return { tools: allTools };
  });

  // ─── CallTool handler ──────────────────────────────────────────────
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Handle the reload meta-tool
    if (name === "_swagger_mcp_reload") {
      console.error("[swagger-mcp] Reloading spec...");
      try {
        const reloaded = await loadSpec(config);
        tools = reloaded.tools;
        mappings = reloaded.mappings;
        baseUrl = reloaded.baseUrl;
        apiTitle = reloaded.apiTitle;

        return {
          content: [
            {
              type: "text" as const,
              text: `Successfully reloaded spec. Found ${tools.length} tools from "${apiTitle}".`,
            },
          ],
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: "text" as const, text: `Failed to reload spec: ${message}` },
          ],
          isError: true,
        };
      }
    }

    // Look up the tool mapping
    const mapping = mappings.get(name);
    if (!mapping) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Unknown tool: "${name}". Use ListTools to see available tools.`,
          },
        ],
        isError: true,
      };
    }

    // Execute the HTTP request with catch-all error handling
    try {
      const result = await executeToolRequest(
        mapping,
        (args || {}) as Record<string, unknown>,
        config,
        baseUrl
      );

      return {
        content: [{ type: "text" as const, text: result.content }],
        isError: result.isError,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Unexpected error executing tool "${name}": ${message}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Loads the spec, builds tools, and resolves the base URL.
 */
async function loadSpec(config: ServerConfig): Promise<{
  tools: McpToolDefinition[];
  mappings: Map<string, ToolMapping>;
  baseUrl: string;
  apiTitle: string;
}> {
  const { operations, specBaseUrl, title } = await parseSwaggerSpec(
    config.specUrl
  );

  const { tools, mappings } = buildTools(operations);

  // Resolve base URL with 3-tier priority:
  // 1. Config override (env var / CLI arg)
  // 2. Spec's servers[0].url or host+basePath
  // 3. Origin of the spec URL
  const baseUrl = resolveBaseUrl(config.specUrl, config.baseUrl, specBaseUrl);

  console.error(`[swagger-mcp] Base URL: ${baseUrl}`);
  console.error(`[swagger-mcp] Registered ${tools.length} tools:`);
  for (const tool of tools) {
    console.error(`  - ${tool.name}`);
  }

  return { tools, mappings, baseUrl, apiTitle: title };
}

/**
 * Resolves the base URL from 3 sources (priority order):
 * 1. Explicit override from config
 * 2. Base URL extracted from the spec
 * 3. Origin of the spec URL itself
 */
export function resolveBaseUrl(
  specUrl: string,
  configBaseUrl?: string,
  specBaseUrl?: string
): string {
  // Priority 1: explicit config
  if (configBaseUrl) {
    return configBaseUrl.replace(/\/+$/, "");
  }

  // Priority 2: from spec
  if (specBaseUrl) {
    // specBaseUrl might be a relative path (OpenAPI 3.x allows this)
    if (
      specBaseUrl.startsWith("http://") ||
      specBaseUrl.startsWith("https://")
    ) {
      return specBaseUrl.replace(/\/+$/, "");
    }
    // Relative path — combine with spec URL origin
    try {
      const origin = new URL(specUrl).origin;
      return `${origin}${specBaseUrl}`.replace(/\/+$/, "");
    } catch {
      // specUrl might be a file path — can't extract origin
      return specBaseUrl.replace(/\/+$/, "");
    }
  }

  // Priority 3: origin of the spec URL
  try {
    const parsed = new URL(specUrl);
    return parsed.origin;
  } catch {
    console.error(
      "[swagger-mcp] Warning: Could not derive base URL. " +
        "Please provide SWAGGER_MCP_BASE_URL explicitly."
    );
    // Return a clearly broken URL so errors are obvious
    return "http://localhost";
  }
}
