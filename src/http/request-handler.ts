import { ServerConfig, ToolMapping } from "../core/types.js";
import { getAuthHeaders } from "./auth.js";

/**
 * Executes an HTTP request for a tool invocation.
 *
 * Takes the tool mapping (which knows the operation details) and the
 * arguments provided by the LLM, builds the full HTTP request, executes it,
 * and returns the response as a string.
 */
export async function executeToolRequest(
  mapping: ToolMapping,
  args: Record<string, unknown>,
  config: ServerConfig,
  baseUrl: string
): Promise<{ content: string; isError: boolean }> {
  const { operation } = mapping;

  try {
    // 1. Validate required path parameters are present
    const missingPathParams = operation.parameters
      .filter((p) => p.in === "path" && p.required && args[p.name] === undefined)
      .map((p) => p.name);

    if (missingPathParams.length > 0) {
      return {
        content: `Missing required path parameter(s): ${missingPathParams.join(", ")}`,
        isError: true,
      };
    }

    // 2. Build the URL with path parameters substituted
    let url = buildUrl(baseUrl, operation.path, args, operation.parameters);

    // 3. Append query parameters
    url = appendQueryParams(url, args, operation.parameters);

    // 4. Build headers
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...config.defaultHeaders,
      ...getAuthHeaders(config.auth),
    };

    // Add header parameters from args
    for (const param of operation.parameters) {
      if (param.in === "header" && args[param.name] !== undefined) {
        headers[param.name] = String(args[param.name]);
      }
    }

    // 5. Build request body (for methods that support it)
    let body: string | undefined;
    if (args.body !== undefined && ["post", "put", "patch", "delete"].includes(operation.method)) {
      headers["Content-Type"] =
        operation.requestBody?.contentType || "application/json";
      body =
        typeof args.body === "string"
          ? args.body
          : JSON.stringify(args.body);
    }

    // 6. Execute the request
    console.error(
      `[swagger-mcp] ${operation.method.toUpperCase()} ${url}`
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);

    try {
      const response = await fetch(url, {
        method: operation.method.toUpperCase(),
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // 7. Process response
      const responseText = await response.text();

      if (!response.ok) {
        return {
          content: formatErrorResponse(
            response.status,
            response.statusText,
            responseText
          ),
          isError: true,
        };
      }

      return {
        content: formatSuccessResponse(response.status, responseText),
        isError: false,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error: unknown) {
    // Use standard AbortError detection instead of string matching
    if (error instanceof Error && error.name === "AbortError") {
      return {
        content: `Request timed out after ${config.timeout}ms`,
        isError: true,
      };
    }

    const message =
      error instanceof Error ? error.message : String(error);
    return {
      content: `Request failed: ${message}`,
      isError: true,
    };
  }
}

/**
 * Builds the full URL by substituting path parameters into the template.
 * Uses replaceAll to handle duplicate path params (e.g. /users/{id}/friends/{id}).
 */
function buildUrl(
  baseUrl: string,
  pathTemplate: string,
  args: Record<string, unknown>,
  parameters: ToolMapping["operation"]["parameters"]
): string {
  let resolvedPath = pathTemplate;

  // Substitute path parameters: /users/{id} → /users/123
  for (const param of parameters) {
    if (param.in === "path" && args[param.name] !== undefined) {
      resolvedPath = resolvedPath.replaceAll(
        `{${param.name}}`,
        encodeURIComponent(String(args[param.name]))
      );
    }
  }

  // Ensure no double slashes between baseUrl and path
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const cleanPath = resolvedPath.startsWith("/")
    ? resolvedPath
    : `/${resolvedPath}`;

  return `${cleanBase}${cleanPath}`;
}

/**
 * Appends query parameters to the URL.
 * Skips null/undefined values to prevent sending "null" as a string.
 */
function appendQueryParams(
  url: string,
  args: Record<string, unknown>,
  parameters: ToolMapping["operation"]["parameters"]
): string {
  const queryParams = new URLSearchParams();

  for (const param of parameters) {
    if (param.in === "query" && args[param.name] != null) {
      const value = args[param.name];
      if (Array.isArray(value)) {
        // Handle array query params
        for (const item of value) {
          if (item != null) {
            queryParams.append(param.name, String(item));
          }
        }
      } else {
        queryParams.set(param.name, String(value));
      }
    }
  }

  const queryString = queryParams.toString();
  if (!queryString) return url;

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${queryString}`;
}

/**
 * Formats a successful response for the MCP tool result.
 */
function formatSuccessResponse(status: number, body: string): string {
  let formattedBody: string;
  try {
    const parsed = JSON.parse(body);
    formattedBody = JSON.stringify(parsed, null, 2);
  } catch {
    formattedBody = body;
  }

  return `HTTP ${status}\n\n${formattedBody}`;
}

/**
 * Formats an error response for the MCP tool result.
 */
function formatErrorResponse(
  status: number,
  statusText: string,
  body: string
): string {
  let formattedBody: string;
  try {
    const parsed = JSON.parse(body);
    formattedBody = JSON.stringify(parsed, null, 2);
  } catch {
    formattedBody = body;
  }

  return `HTTP ${status} ${statusText}\n\n${formattedBody}`;
}
