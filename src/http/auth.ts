import { AuthConfig } from "../core/types.js";

/**
 * Builds authentication headers from the provided auth configuration.
 * Multiple auth mechanisms can coexist — all matching headers are merged.
 *
 * Returns an empty object if no auth is configured.
 */
export function getAuthHeaders(auth: AuthConfig): Record<string, string> {
  const headers: Record<string, string> = {};

  // Bearer token → Authorization: Bearer <token>
  if (auth.bearerToken) {
    headers["Authorization"] = `Bearer ${auth.bearerToken}`;
  }

  // API Key → <header>: <key> (default header: X-API-Key)
  if (auth.apiKey) {
    const headerName = auth.apiKeyHeader || "X-API-Key";
    headers[headerName] = auth.apiKey;
  }

  // Basic auth → Authorization: Basic <base64(user:pass)>
  // Uses !== undefined to allow empty string passwords (which are valid in HTTP Basic Auth).
  // Note: if bearer is also set, basic will overwrite the Authorization header.
  if (auth.basicUser !== undefined && auth.basicPass !== undefined) {
    if (auth.bearerToken) {
      console.error(
        "[swagger-mcp] Warning: Both Bearer token and Basic auth are configured. " +
          "Basic auth will overwrite the Authorization header."
      );
    }
    const credentials = Buffer.from(
      `${auth.basicUser}:${auth.basicPass}`
    ).toString("base64");
    headers["Authorization"] = `Basic ${credentials}`;
  }

  return headers;
}
