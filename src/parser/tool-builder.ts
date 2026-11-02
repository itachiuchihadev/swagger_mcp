import { createHash } from "crypto";
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
  // Compute deterministic hash from method + path
  const signature = `${operation.method.toLowerCase()}:${operation.path}`;
  const hash = getDeterministicHash(signature, 6);

  let name: string;

  if (operation.operationId) {
    // Priority 1: use operationId directly — preserve its casing
    if (operation.operationId.length > 64) {
      // Check if it's a compound operationId with separators or camelCase
      const isCompound = /[_A-Z-]/.test(operation.operationId);
      if (isCompound) {
        name = compressOversizedName(
          operation.operationId,
          operation.method,
          operation.path
        );
      } else {
        name = sanitizeName(operation.operationId, false);
      }
    } else {
      name = sanitizeName(operation.operationId, false);
    }
  } else {
    // Priority 2: method + path — lowercase
    name = compressPathAndName(operation.method, operation.path, operation.tag);
  }

  // Guard against empty name after sanitization
  if (!name) {
    name = "unnamed_tool";
  }

  // Append the deterministic hash to every tool name (guarantees uniqueness across endpoints)
  if (!name.endsWith(`_${hash}`)) {
    const maxBaseLen = 64 - (hash.length + 1); // 57 characters
    const trimmedBase = name.substring(0, maxBaseLen).replace(/_+$/, "");
    name = `${trimmedBase}_${hash}`;
  }

  // Ensure uniqueness by appending a counter if needed (edge-case collision fallback)
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
 * Computes a short deterministic hex hash from a signature string.
 */
export function getDeterministicHash(input: string, length = 6): string {
  return createHash("sha256").update(input).digest("hex").substring(0, length);
}

/**
 * Compresses an oversized name (> 64 chars) by preserving the root domain (Head),
 * the specific action/resource (Tail), and appending a deterministic hash derived
 * from the full operation signature to guarantee uniqueness.
 */
export function compressOversizedName(
  fullName: string,
  method?: string,
  rawPath?: string
): string {
  if (fullName.length <= 64) {
    return fullName;
  }

  const signature = `${method?.toLowerCase() || ""}:${rawPath || fullName}`;
  const hash = getDeterministicHash(signature, 6);

  // Tokenize the name: handles camelCase, PascalCase, snake_case, and kebab-case
  const tokens = fullName
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2") // Split camelCase
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);

  if (tokens.length <= 1) {
    // Single unbroken token without delimiters
    const maxPrefixLen = 64 - 7;
    const truncated = fullName.substring(0, maxPrefixLen);
    return `${truncated}_${hash}`.toLowerCase();
  }

  // Multi-token: extract head (first 1-2 tokens) and tail (last 1-2 tokens)
  // Budget: 64 total - 2 underscores - 6 hash = 56 chars -> 26 head, 26 tail
  const headStr = tokens.slice(0, 2).join("_").substring(0, 26).replace(/_$/, "");
  const tailStr = tokens.slice(-2).join("_").substring(0, 26).replace(/^_/, "");

  const combined = `${headStr}_${tailStr}_${hash}`.toLowerCase();
  return sanitizeName(combined, true);
}

/**
 * Smartly compresses long HTTP paths and tags into clean, human-readable tool names (<= 64 chars).
 * - Strips redundant API prefixes (/api/v1, /v2, /rest, etc.)
 * - Cleans path parameter placeholders ({id} -> by_id)
 * - Deduplicates redundant tag/segment prefixes
 * - Preserves Root Domain (first segment) and Leaf Action (trailing segments)
 * - For oversized paths (> 60 chars), applies Head + Tail + Deterministic Hash
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

  // Strategy B: Root + Leaf preservation (prevents collision across different parent resources)
  if (cleanedSegments.length >= 3) {
    const rootSeg = cleanedSegments[0];
    const leafSegs = cleanedSegments.slice(-2).join("_");
    let rootLeafCandidate = tagPrefix
      ? `${tagPrefix}${methodLower}_${rootSeg}_${leafSegs}`
      : `${methodLower}_${rootSeg}_${leafSegs}`;
    rootLeafCandidate = sanitizeName(rootLeafCandidate, true);

    if (rootLeafCandidate.length <= 60 && rootLeafCandidate.length > 0) {
      return rootLeafCandidate;
    }

    // Try root + single final leaf
    const singleLeaf = cleanedSegments[cleanedSegments.length - 1];
    let compactCandidate = tagPrefix
      ? `${tagPrefix}${methodLower}_${rootSeg}_${singleLeaf}`
      : `${methodLower}_${rootSeg}_${singleLeaf}`;
    compactCandidate = sanitizeName(compactCandidate, true);

    if (compactCandidate.length <= 60 && compactCandidate.length > 0) {
      return compactCandidate;
    }
  } else if (cleanedSegments.length === 2) {
    const leaf = cleanedSegments[1];
    let shortCandidate = tagPrefix ? `${tagPrefix}${methodLower}_${leaf}` : `${methodLower}_${leaf}`;
    shortCandidate = sanitizeName(shortCandidate, true);
    if (shortCandidate.length <= 60 && shortCandidate.length > 0) {
      return shortCandidate;
    }
  }

  // Strategy C: Head-Tail + Deterministic Hash for oversized paths (> 60 chars)
  return compressOversizedName(candidate, method, rawPath);
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
