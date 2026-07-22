
// ─── HTTP Methods we care about ─────────────────────────────────────────────
export const HTTP_METHODS = ["get", "post", "put", "delete", "patch"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

// ─── Parsed parameter from OpenAPI spec ─────────────────────────────────────
export interface ParsedParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  description?: string;
  required: boolean;
  schema: Record<string, unknown>; // JSON Schema
}

// ─── Parsed request body ────────────────────────────────────────────────────
export interface ParsedRequestBody {
  description?: string;
  required: boolean;
  schema: Record<string, unknown>; // JSON Schema
  contentType: string;
}

// ─── A single parsed API operation ──────────────────────────────────────────
export interface ParsedOperation {
  /** The operationId from the spec (may be undefined) */
  operationId?: string;
  /** HTTP method */
  method: HttpMethod;
  /** The raw path template, e.g. /users/{id} */
  path: string;
  /** First tag from the operation (if any) */
  tag?: string;
  /** Short summary from the spec */
  summary?: string;
  /** Longer description from the spec */
  description?: string;
  /** All parameters (path, query, header, cookie) */
  parameters: ParsedParameter[];
  /** Request body (for POST/PUT/PATCH) */
  requestBody?: ParsedRequestBody;
}

// ─── Server configuration ───────────────────────────────────────────────────
export interface AuthConfig {
  bearerToken?: string;
  apiKey?: string;
  apiKeyHeader?: string; // defaults to "X-API-Key"
  basicUser?: string;
  basicPass?: string;
}

export interface ServerConfig {
  /** Swagger/OpenAPI spec URL (required) */
  specUrl: string;
  /** Override base URL — auto-derived if omitted */
  baseUrl?: string;
  /** Authentication configuration */
  auth: AuthConfig;
  /** Request timeout in milliseconds (default: 30000) */
  timeout: number;
  /** Extra headers to attach to every outgoing request */
  defaultHeaders: Record<string, string>;
}

// ─── Tool mapping — connects tool names back to operations ──────────────────
export interface ToolMapping {
  /** The MCP tool name */
  toolName: string;
  /** The parsed operation this tool maps to */
  operation: ParsedOperation;
}
