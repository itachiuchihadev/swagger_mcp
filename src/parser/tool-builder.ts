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
 * 2. tag + method + path (if tag exists) — lowercased
 * 3. method + path (last resort) — lowercased
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
  } else if (operation.tag) {
    // Priority 2: tag + method + path — lowercase
    name = sanitizeName(
      `${operation.tag}_${operation.method}_${operation.path}`,
      true
    );
  } else {
    // Priority 3: method + path — lowercase
    name = sanitizeName(`${operation.method}_${operation.path}`, true);
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
