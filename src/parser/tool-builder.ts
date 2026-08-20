import { ParsedOperation, ToolMapping } from "../core/types.js";

/**
 * Converts parsed OpenAPI operations into MCP tool definitions and mappings.
 */
export function buildTools(operations: ParsedOperation[]): {
  tools: McpToolDefinition[];
  mappings: Map<string, ToolMapping>;
} {
  const tools: McpToolDefinition[] = [];
  const mappings = new Map<string, ToolMapping>();
  const usedNames = new Set<string>();

  for (const operation of operations) {
    const toolName = generateToolName(operation, usedNames);
    usedNames.add(toolName);

    const tool = buildToolDefinition(toolName, operation);
    tools.push(tool);

    mappings.set(toolName, { toolName, operation });
  }

  return { tools, mappings };
}

// ─── MCP Tool Definition Shape ──────────────────────────────────────────────
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// ─── Tool Name Generation ───────────────────────────────────────────────────

/**
 * Generates a unique MCP tool name for an operation.
 *
 * Priority:
 * 1. operationId (if present in the spec) — preserves casing
 * 2. Smart compressed tag + method + path — lowercased, max 64 chars
 *
 * Sanitization: replace special chars with _, collapse multiples,
 * strip leading/trailing _, max 64 chars.
 */
export function generateToolName(
  operation: ParsedOperation,
  usedNames: Set<string>
): string {
  let name: string;

  if (operation.operationId) {
    // Priority 1: use operationId directly — preserve its casing
    name = sanitizeName(operation.operationId, false);
  } else {
    // Priority 2: smart compressed path & tag name generation
    name = compressPathAndName(operation.method, operation.path, operation.tag);
  }

  // Guard against empty name after sanitization
  if (!name) {
    name = "unnamed_tool";
  }

  // Ensure uniqueness by appending a counter if needed
  let uniqueName = name;
  let counter = 2;
  while (usedNames.has(uniqueName)) {
    const suffix = `_${counter}`;
    uniqueName = name.substring(0, 64 - suffix.length) + suffix;
    counter++;
  }

  return uniqueName;
}

/**
 * Smartly compresses long HTTP paths and tags into clean, human-readable tool names (<= 64 chars).
 * - Strips redundant API prefixes (/api/v1, /v2, /rest, etc.)
 * - Cleans path parameter placeholders ({id} -> by_id)
 * - Summarizes long paths using key trailing resource segments to prevent arbitrary truncation
 */
export function compressPathAndName(
  method: string,
  rawPath: string,
  tag?: string
): string {
  // 1. Strip common API boilerplate prefixes
  const pathWithoutPrefix = rawPath.replace(
    /^\/(?:api\/v\d+|rest\/v\d+|api|rest|v\d+)\//i,
    "/"
  );

  // 2. Tokenize path segments
  const segments = pathWithoutPrefix.split("/").filter(Boolean);

  const cleanedSegments: string[] = [];
  for (const seg of segments) {
    if (seg.startsWith("{") && seg.endsWith("}")) {
      const paramInner = seg.slice(1, -1);
      const cleanedParam = paramInner.replace(/(?:Id|_id)$/i, "").toLowerCase();
      if (cleanedParam === "" || cleanedParam === "id") {
        cleanedSegments.push("id");
      } else {
        cleanedSegments.push(`by_${cleanedParam}`);
      }
    } else {
      cleanedSegments.push(seg);
    }
  }

  const methodLower = method.toLowerCase();
  const tagPrefix = tag ? `${sanitizeName(tag, true)}_` : "";

  // Strategy A: Full compressed path
  const fullPathStr = cleanedSegments.join("_");
  let candidate = tagPrefix ? `${tagPrefix}${methodLower}_${fullPathStr}` : `${methodLower}_${fullPathStr}`;
  candidate = sanitizeName(candidate, true);

  if (candidate.length <= 60 && candidate.length > 0) {
    return candidate;
  }

  // Strategy B: Over 60 chars — use the last 3 most specific segments (actions & resources live at the end of REST URLs)
  const last3 = cleanedSegments.slice(-3).join("_");
  let shortCandidate = tagPrefix ? `${tagPrefix}${methodLower}_${last3}` : `${methodLower}_${last3}`;
  shortCandidate = sanitizeName(shortCandidate, true);

  if (shortCandidate.length <= 60 && shortCandidate.length > 0) {
    return shortCandidate;
  }

  // Strategy C: Last 2 segments
  const last2 = cleanedSegments.slice(-2).join("_");
  let ultraShortCandidate = tagPrefix ? `${tagPrefix}${methodLower}_${last2}` : `${methodLower}_${last2}`;
  ultraShortCandidate = sanitizeName(ultraShortCandidate, true);

  if (ultraShortCandidate.length <= 60 && ultraShortCandidate.length > 0) {
    return ultraShortCandidate;
  }

  // Fallback: hard truncate cleanly to 64
  return candidate.substring(0, 64).replace(/^_|_$/g, "");
}

/**
 * Sanitizes a string into a valid MCP tool name.
 * - Optionally lowercase
 * - Replace special chars with _
 * - Collapse multiple _ into one
 * - Strip leading/trailing _
 * - Max 64 characters
 */
function sanitizeName(raw: string, forceLowercase: boolean): string {
  let name = raw;
  if (forceLowercase) {
    name = name.toLowerCase();
  }
  return name
    .replace(/[^a-zA-Z0-9_]/g, "_") // replace invalid chars with _
    .replace(/_+/g, "_") // collapse multiple _
    .replace(/^_|_$/g, "") // strip leading/trailing _
    .substring(0, 64);
}

// ─── Tool Definition Building ───────────────────────────────────────────────

/**
 * Builds a full MCP tool definition from an operation.
 */
function buildToolDefinition(
  toolName: string,
  operation: ParsedOperation
): McpToolDefinition {
  // Build description: [METHOD /path] — summary — description
  const descParts: string[] = [];
  descParts.push(`[${operation.method.toUpperCase()} ${operation.path}]`);
  if (operation.summary) descParts.push(operation.summary);
  if (operation.description && operation.description !== operation.summary) {
    descParts.push(operation.description);
  }
  const description = descParts.join(" — ");

  // Build input schema
  const properties: Record<string, unknown> = {};
  const requiredSet = new Set<string>();

  // Add parameters (path, query, header)
  for (const param of operation.parameters) {
    // Skip cookie params — rarely used with MCP
    if (param.in === "cookie") continue;

    // Check for collision with the reserved "body" property name
    const propName =
      param.name === "body" && operation.requestBody
        ? "body_param"
        : param.name;

    const propSchema: Record<string, unknown> = { ...param.schema };

    // Enrich description with parameter location info
    const descPieces: string[] = [];
    if (param.description) descPieces.push(param.description);
    descPieces.push(`(${param.in} parameter)`);
    propSchema.description = descPieces.join(" ");

    properties[propName] = propSchema;

    if (param.required) {
      requiredSet.add(propName);
    }
  }

  // Add request body
  if (operation.requestBody) {
    const bodySchema: Record<string, unknown> = {
      ...operation.requestBody.schema,
    };
    if (operation.requestBody.description) {
      bodySchema.description = operation.requestBody.description;
    }

    properties["body"] = bodySchema;

    if (operation.requestBody.required) {
      requiredSet.add("body");
    }
  }

  const required = [...requiredSet];

  return {
    name: toolName,
    description,
    inputSchema: {
      type: "object" as const,
      properties,
      ...(required.length > 0 ? { required } : {}),
    },
  };
}
