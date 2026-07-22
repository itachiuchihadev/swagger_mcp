import { ServerConfig } from "./types.js";

/**
 * Loads server configuration from environment variables and CLI arguments.
 *
 * Priority: CLI args override env vars.
 * Only SWAGGER_MCP_SPEC_URL is required — everything else is optional.
 */
export function loadConfig(): ServerConfig {
  const args = parseCliArgs(process.argv.slice(2));

  const specUrl = args["spec-url"] || process.env.SWAGGER_MCP_SPEC_URL;
  if (!specUrl) {
    console.error(
      "Error: Swagger spec URL is required.\n" +
        "Provide it via --spec-url <url> or SWAGGER_MCP_SPEC_URL env var."
    );
    process.exit(1);
  }

  // Parse extra headers from JSON string
  let defaultHeaders: Record<string, string> = {};
  const headersRaw =
    args["headers"] || process.env.SWAGGER_MCP_HEADERS;
  if (headersRaw) {
    try {
      defaultHeaders = JSON.parse(headersRaw);
    } catch {
      console.error(
        "Warning: SWAGGER_MCP_HEADERS is not valid JSON, ignoring."
      );
    }
  }

  const timeoutRaw =
    args["timeout"] || process.env.SWAGGER_MCP_TIMEOUT;

  return {
    specUrl,
    baseUrl: args["base-url"] || process.env.SWAGGER_MCP_BASE_URL || undefined,
    auth: {
      bearerToken:
        args["bearer-token"] ||
        process.env.SWAGGER_MCP_BEARER_TOKEN ||
        undefined,
      apiKey:
        args["api-key"] || process.env.SWAGGER_MCP_API_KEY || undefined,
      apiKeyHeader:
        args["api-key-header"] ||
        process.env.SWAGGER_MCP_API_KEY_HEADER ||
        undefined,
      basicUser:
        args["basic-user"] ||
        process.env.SWAGGER_MCP_BASIC_USER ||
        undefined,
      basicPass:
        args["basic-pass"] ||
        process.env.SWAGGER_MCP_BASIC_PASS ||
        undefined,
    },
    timeout: timeoutRaw ? parseInt(timeoutRaw, 10) : 30_000,
    defaultHeaders,
  };
}

/**
 * Builds a ServerConfig from explicit values (useful for testing and programmatic use).
 * Applies defaults for optional fields.
 */
export function buildConfig(overrides: Partial<ServerConfig> & { specUrl: string }): ServerConfig {
  return {
    specUrl: overrides.specUrl,
    baseUrl: overrides.baseUrl,
    auth: overrides.auth ?? {},
    timeout: overrides.timeout ?? 30_000,
    defaultHeaders: overrides.defaultHeaders ?? {},
  };
}

/**
 * Simple CLI argument parser.
 * Supports: --key value and --key=value
 * Returns a Record<string, string>.
 */
export function parseCliArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;

    const equalIndex = arg.indexOf("=");
    if (equalIndex !== -1) {
      // --key=value
      const key = arg.substring(2, equalIndex);
      result[key] = arg.substring(equalIndex + 1);
    } else {
      // --key value
      const key = arg.substring(2);
      const nextArg = argv[i + 1];
      if (nextArg && !nextArg.startsWith("--")) {
        result[key] = nextArg;
        i++; // skip the value
      }
    }
  }

  return result;
}
