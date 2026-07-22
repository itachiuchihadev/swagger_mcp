import SwaggerParser from "@apidevtools/swagger-parser";
import {
  ParsedOperation,
  ParsedParameter,
  ParsedRequestBody,
  HttpMethod,
  HTTP_METHODS,
} from "../core/types.js";

// We use 'any' for the parsed OpenAPI document because SwaggerParser.dereference()
// returns a union of V2/V3/V3.1 types that causes strict TS incompatibilities.
// Since we access the spec dynamically (via Record<string, unknown> casts), this is safe.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpenAPIDocument = any;

/**
 * Fetches and parses a Swagger/OpenAPI spec from a URL or file path.
 * Supports both Swagger 2.0 and OpenAPI 3.x.
 * Returns parsed operations and the resolved base URL from the spec.
 */
export async function parseSwaggerSpec(specUrl: string): Promise<{
  operations: ParsedOperation[];
  specBaseUrl: string | undefined;
  title: string;
  version: string;
}> {
  console.error(`[swagger-mcp] Fetching spec from: ${specUrl}`);

  let api: OpenAPIDocument;
  try {
    // Dereference resolves all $ref pointers so we get a flat object
    api = await SwaggerParser.dereference(specUrl);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to fetch or parse OpenAPI spec from "${specUrl}": ${message}`
    );
  }

  const title = api.info?.title || "Unknown API";
  const version = api.info?.version || "0.0.0";
  console.error(`[swagger-mcp] Parsed: ${title} v${version}`);

  const specBaseUrl = extractBaseUrl(api);
  const operations = extractOperations(api);

  console.error(`[swagger-mcp] Found ${operations.length} operations`);
  return { operations, specBaseUrl, title, version };
}

/**
 * Extracts the base URL from the spec.
 * - OpenAPI 3.x: uses servers[0].url
 * - Swagger 2.0: uses host + basePath + schemes
 */
function extractBaseUrl(api: OpenAPIDocument): string | undefined {
  // OpenAPI 3.x
  if ("openapi" in api && api.openapi?.startsWith("3")) {
    const doc = api;
    if (doc.servers && doc.servers.length > 0) {
      return doc.servers[0].url;
    }
    return undefined;
  }

  // Swagger 2.0
  if ("swagger" in api) {
    const doc = api;
    if (doc.host) {
      const scheme =
        doc.schemes && doc.schemes.length > 0 ? doc.schemes[0] : "https";
      const basePath = doc.basePath || "";
      return `${scheme}://${doc.host}${basePath}`;
    }
    return undefined;
  }

  return undefined;
}

/**
 * Extracts all operations from the spec into ParsedOperation objects.
 */
function extractOperations(api: OpenAPIDocument): ParsedOperation[] {
  const operations: ParsedOperation[] = [];

  if (!api.paths) return operations;

  const isV3 = "openapi" in api;

  for (const [path, pathItem] of Object.entries(api.paths)) {
    if (!pathItem) continue;

    // Path-level parameters (shared by all operations on this path)
    const pathLevelParams = extractPathLevelParams(
      pathItem as Record<string, unknown>
    );

    for (const method of HTTP_METHODS) {
      const operation = (pathItem as Record<string, unknown>)[method];
      if (!operation || typeof operation !== "object") continue;

      const op = operation as Record<string, unknown>;

      // Parse operation-level parameters, filtering out body params for Swagger 2.0
      // (body params are handled separately in parseRequestBody)
      const rawOperationParams = parseParameters(
        (op.parameters as unknown[]) || []
      );
      const operationParams = rawOperationParams.filter(
        (p) => p.in !== "body" as string
      );

      // Merge path-level and operation-level parameters
      const mergedParams = mergeParameters(pathLevelParams, operationParams);

      // Parse request body
      const requestBody = parseRequestBody(op, api);

      // Extract tag
      const tags = op.tags as string[] | undefined;
      const tag = tags && tags.length > 0 ? tags[0] : undefined;

      operations.push({
        operationId: op.operationId as string | undefined,
        method,
        path,
        tag,
        summary: op.summary as string | undefined,
        description: op.description as string | undefined,
        parameters: mergedParams,
        requestBody,
      });
    }
  }

  return operations;
}

/**
 * Extracts path-level parameters from a path item.
 * Filters out body and formData params (handled separately).
 */
function extractPathLevelParams(
  pathItem: Record<string, unknown>
): ParsedParameter[] {
  const params = pathItem.parameters;
  if (!Array.isArray(params)) return [];
  return parseParameters(params).filter(
    (p) => p.in !== "body" as string
  );
}

/**
 * Parses parameter objects into ParsedParameter[].
 * Handles both Swagger 2.0 and OpenAPI 3.x parameter formats.
 */
function parseParameters(params: unknown[]): ParsedParameter[] {
  return params
    .filter(
      (p): p is Record<string, unknown> =>
        p !== null && typeof p === "object"
    )
    .filter((param) => {
      // Skip formData params — they're used for file uploads and
      // don't map cleanly to JSON-based MCP tool inputs
      const paramIn = param.in as string;
      return paramIn !== "formData";
    })
    .map((param) => {
      // Swagger 2.0: type is directly on the param
      // OpenAPI 3.x: type is in param.schema
      let schema: Record<string, unknown> = {};

      if (param.schema && typeof param.schema === "object") {
        // OpenAPI 3.x
        schema = sanitizeSchema(param.schema as Record<string, unknown>);
      } else if (param.type) {
        // Swagger 2.0
        const schemaObj: Record<string, unknown> = {
          type: param.type as string,
        };
        if (param.format) schemaObj.format = param.format;
        if (param.enum) schemaObj.enum = param.enum;
        if (param.default !== undefined) schemaObj.default = param.default;
        if (param.items && typeof param.items === "object") {
          schemaObj.items = sanitizeSchema(
            param.items as Record<string, unknown>
          );
        }
        schema = sanitizeSchema(schemaObj);
      }

      return {
        name: param.name as string,
        in: param.in as ParsedParameter["in"],
        description: param.description as string | undefined,
        required: (param.required as boolean) || false,
        schema,
      };
    });
}

/**
 * Parses request body from an operation.
 * Handles both Swagger 2.0 (body parameter) and OpenAPI 3.x (requestBody).
 */
function parseRequestBody(
  operation: Record<string, unknown>,
  api: OpenAPIDocument
): ParsedRequestBody | undefined {
  // OpenAPI 3.x: requestBody object
  if ("openapi" in api && operation.requestBody) {
    const rb = operation.requestBody as Record<string, unknown>;
    const content = rb.content as Record<string, unknown> | undefined;

    if (content) {
      // Prefer application/json, fall back to first content type
      const contentType = content["application/json"]
        ? "application/json"
        : Object.keys(content)[0];

      if (contentType) {
        const mediaType = content[contentType] as Record<string, unknown>;
        const schema = mediaType?.schema as
          | Record<string, unknown>
          | undefined;

        return {
          description: rb.description as string | undefined,
          required: (rb.required as boolean) || false,
          schema: schema ? sanitizeSchema(schema) : { type: "object" },
          contentType,
        };
      }
    }
    return undefined;
  }

  // Swagger 2.0: look for a parameter with in: "body"
  const params = operation.parameters as unknown[] | undefined;
  if (params) {
    const bodyParam = params.find(
      (p: unknown) =>
        p !== null &&
        typeof p === "object" &&
        (p as Record<string, unknown>).in === "body"
    ) as Record<string, unknown> | undefined;

    if (bodyParam) {
      const schema = bodyParam.schema as Record<string, unknown> | undefined;
      return {
        description: bodyParam.description as string | undefined,
        required: (bodyParam.required as boolean) || false,
        schema: schema ? sanitizeSchema(schema) : { type: "object" },
        contentType: "application/json",
      };
    }
  }

  return undefined;
}

/**
 * Merge path-level and operation-level parameters.
 * Operation params override path-level params with the same name+in.
 */
function mergeParameters(
  pathParams: ParsedParameter[],
  operationParams: ParsedParameter[]
): ParsedParameter[] {
  const merged = new Map<string, ParsedParameter>();

  for (const p of pathParams) {
    merged.set(`${p.in}:${p.name}`, p);
  }
  for (const p of operationParams) {
    merged.set(`${p.in}:${p.name}`, p);
  }

  return Array.from(merged.values());
}

/**
 * Sanitizes a schema object for use as a JSON Schema in MCP tools.
 * Removes OpenAPI-specific extensions and null/undefined values.
 *
 * Uses a WeakSet to track visited objects and prevent infinite loops
 * on circular references (which SwaggerParser.dereference() can create).
 */
export function sanitizeSchema(
  schema: Record<string, unknown>,
  visited: WeakSet<object> = new WeakSet()
): Record<string, unknown> {
  // Circular reference guard
  if (visited.has(schema)) {
    return { type: "object", description: "(circular reference)" };
  }
  visited.add(schema);

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    // Skip OpenAPI-specific extensions and undefined/null values
    if (key.startsWith("x-") || value === undefined || value === null) continue;
    // Skip XML definitions
    if (key === "xml") continue;

    if (key === "properties" && typeof value === "object" && value !== null) {
      // Recursively sanitize nested property schemas
      const props: Record<string, unknown> = {};
      for (const [propName, propSchema] of Object.entries(
        value as Record<string, unknown>
      )) {
        if (propSchema && typeof propSchema === "object") {
          props[propName] = sanitizeSchema(
            propSchema as Record<string, unknown>,
            visited
          );
        } else {
          props[propName] = propSchema;
        }
      }
      result[key] = props;
    } else if (
      key === "items" &&
      typeof value === "object" &&
      value !== null
    ) {
      // Recursively sanitize array items schema
      result[key] = sanitizeSchema(
        value as Record<string, unknown>,
        visited
      );
    } else if (
      key === "additionalProperties" &&
      typeof value === "object" &&
      value !== null
    ) {
      result[key] = sanitizeSchema(
        value as Record<string, unknown>,
        visited
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}
