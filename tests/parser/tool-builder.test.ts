import { describe, it, expect } from 'vitest';
import {
  generateToolName,
  buildTools,
  compressPathAndName,
  compressOversizedName,
  getDeterministicHash,
} from '../../src/parser/tool-builder.js';
import { ParsedOperation } from '../../src/core/types.js';

describe('tool-builder', () => {
  describe('compressPathAndName', () => {
    it('strips /api/v1 prefixes and formats path parameters', () => {
      const result = compressPathAndName('get', '/api/v1/users/{userId}');
      expect(result).toBe('get_users_by_user');
    });

    it('compresses very long paths to keep under 64 chars without awkward truncation', () => {
      const longPath = '/api/v1/user-management/organizations/{organizationUnitId}/billing/subscriptions/{subscriptionId}/invoices';
      const result = compressPathAndName('get', longPath, 'Billing');
      expect(result.length).toBeLessThanOrEqual(64);
      expect(result).toContain('invoices');
      expect(result.endsWith('_m')).toBe(false);
    });
  });

  describe('generateToolName', () => {
    it('uses operationId when present (preserves casing) with deterministic hash', () => {
      const op: ParsedOperation = {
        method: 'get',
        path: '/users',
        operationId: 'GetUserById',
        parameters: []
      };
      const usedNames = new Set<string>();
      const hash = getDeterministicHash('get:/users', 6);
      expect(generateToolName(op, usedNames)).toBe(`GetUserById_${hash}`);
    });

    it('uses tag + method + path with deterministic hash when no operationId', () => {
      const op: ParsedOperation = {
        method: 'get',
        path: '/users',
        tag: 'Users',
        parameters: []
      };
      const usedNames = new Set<string>();
      const hash = getDeterministicHash('get:/users', 6);
      expect(generateToolName(op, usedNames)).toBe(`users_get_users_${hash}`);
    });

    it('uses method + path with deterministic hash as fallback', () => {
      const op: ParsedOperation = {
        method: 'get',
        path: '/users',
        parameters: []
      };
      const usedNames = new Set<string>();
      const hash = getDeterministicHash('get:/users', 6);
      expect(generateToolName(op, usedNames)).toBe(`get_users_${hash}`);
    });

    it('sanitizes special characters and appends deterministic hash', () => {
      const op: ParsedOperation = {
        method: 'post',
        path: '/users/{id}/update-status.json',
        parameters: []
      };
      const usedNames = new Set<string>();
      const hash = getDeterministicHash('post:/users/{id}/update-status.json', 6);
      expect(generateToolName(op, usedNames)).toBe(`post_users_id_update_status_json_${hash}`);
    });

    it('handles uniqueness collision (appends _2, _3 etc)', () => {
      const op: ParsedOperation = {
        method: 'get',
        path: '/users',
        operationId: 'getUsers',
        parameters: []
      };
      const hash = getDeterministicHash('get:/users', 6);
      const baseWithHash = `getUsers_${hash}`;
      const usedNames = new Set<string>([baseWithHash, `${baseWithHash}_2`]);
      expect(generateToolName(op, usedNames)).toBe(`${baseWithHash}_3`);
    });

    it('handles duplicate operationIds on different endpoints without collision', () => {
      const opGet: ParsedOperation = {
        method: 'get',
        path: '/users',
        operationId: 'handleUsers',
        parameters: []
      };
      const opPost: ParsedOperation = {
        method: 'post',
        path: '/users',
        operationId: 'handleUsers',
        parameters: []
      };
      const usedNames = new Set<string>();
      const nameGet = generateToolName(opGet, usedNames);
      usedNames.add(nameGet);
      const namePost = generateToolName(opPost, usedNames);

      expect(nameGet).not.toBe(namePost);
      expect(nameGet).toBe(`handleUsers_${getDeterministicHash('get:/users', 6)}`);
      expect(namePost).toBe(`handleUsers_${getDeterministicHash('post:/users', 6)}`);
    });

    it('handles empty/invalid operationIds with deterministic hash', () => {
      const op: ParsedOperation = {
        method: 'get',
        path: '/users',
        operationId: '!@#$',
        parameters: []
      };
      const usedNames = new Set<string>();
      const hash = getDeterministicHash('get:/users', 6);
      expect(generateToolName(op, usedNames)).toBe(`unnamed_tool_${hash}`);
    });

    it('respects max 64 char limit and appends hash', () => {
      const op: ParsedOperation = {
        method: 'get',
        path: '/users',
        operationId: 'a'.repeat(100),
        parameters: []
      };
      const usedNames = new Set<string>();
      const result = generateToolName(op, usedNames);
      const hash = getDeterministicHash('get:/users', 6);
      expect(result.length).toBe(64);
      expect(result).toBe(`${'a'.repeat(57)}_${hash}`);
    });

    it('handles uniqueness collision near the length limit', () => {
      const op: ParsedOperation = {
        method: 'get',
        path: '/users',
        operationId: 'a'.repeat(100),
        parameters: []
      };
      const hash = getDeterministicHash('get:/users', 6);
      const existingName = `${'a'.repeat(57)}_${hash}`;
      const usedNames = new Set<string>([existingName]);
      const res = generateToolName(op, usedNames);
      expect(res.length).toBe(64);
      expect(res.endsWith('_2')).toBe(true);
    });
  });

  describe('buildTools', () => {
    it('handles empty operations array', () => {
      const { tools, mappings } = buildTools([]);
      expect(tools).toEqual([]);
      expect(mappings.size).toBe(0);
    });

    it('handles single operation with path params', () => {
      const op: ParsedOperation = {
        method: 'get',
        path: '/users/{id}',
        operationId: 'getUser',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ]
      };
      const { tools, mappings } = buildTools([op]);
      const hash = getDeterministicHash('get:/users/{id}', 6);
      const expectedName = `getUser_${hash}`;
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe(expectedName);
      expect(tools[0].inputSchema.properties).toHaveProperty('id');
      expect((tools[0].inputSchema.properties as any).id.description).toContain('(path parameter)');
      expect(tools[0].inputSchema.required).toEqual(['id']);
      expect(mappings.get(expectedName)?.operation).toEqual(op);
    });

    it('handles operation with query params, required and optional', () => {
      const op: ParsedOperation = {
        method: 'get',
        path: '/search',
        operationId: 'search',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } }
        ]
      };
      const { tools } = buildTools([op]);
      expect(tools[0].inputSchema.required).toEqual(['q']);
      expect(tools[0].inputSchema.properties).toHaveProperty('q');
      expect(tools[0].inputSchema.properties).toHaveProperty('limit');
    });

    it('handles operation with request body', () => {
      const op: ParsedOperation = {
        method: 'post',
        path: '/users',
        operationId: 'createUser',
        parameters: [],
        requestBody: {
          required: true,
          description: 'User details',
          schema: { type: 'object', properties: { name: { type: 'string' } } }
        }
      };
      const { tools } = buildTools([op]);
      expect(tools[0].inputSchema.required).toEqual(['body']);
      expect(tools[0].inputSchema.properties).toHaveProperty('body');
      expect((tools[0].inputSchema.properties as any).body.description).toBe('User details');
    });

    it('renames parameter named "body" when requestBody also exists', () => {
      const op: ParsedOperation = {
        method: 'post',
        path: '/users',
        operationId: 'createUserWithBodyParam',
        parameters: [
          { name: 'body', in: 'query', required: false, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          schema: { type: 'object' }
        }
      };
      const { tools } = buildTools([op]);
      expect(tools[0].inputSchema.properties).toHaveProperty('body_param');
      expect(tools[0].inputSchema.properties).toHaveProperty('body');
    });

    it('generates correct description: method + path + summary + description', () => {
      const op: ParsedOperation = {
        method: 'get',
        path: '/users',
        operationId: 'getUsers',
        summary: 'List users',
        description: 'Returns a list of users',
        parameters: []
      };
      const { tools } = buildTools([op]);
      expect(tools[0].description).toBe('[GET /users] — List users — Returns a list of users');
    });

    it('deduplicates required array', () => {
      const op: ParsedOperation = {
        method: 'get',
        path: '/users',
        operationId: 'getUsers',
        parameters: [
          { name: 'id', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'id', in: 'header', required: true, schema: { type: 'string' } },
        ]
      };
      const { tools } = buildTools([op]);
      expect(tools[0].inputSchema.required).toEqual(['id']);
    });
  });

  describe('compressOversizedName and collision prevention', () => {
    it('compresses oversized compound operationIds with head, tail, and deterministic hash', () => {
      const opA: ParsedOperation = {
        method: 'get',
        path: '/warehouse/containers',
        operationId: 'GlobalSupplyChainLogisticsWarehouseInventoryService_GetShippingManifestByContainerId',
        parameters: [],
      };
      const opB: ParsedOperation = {
        method: 'get',
        path: '/warehouse/consignments',
        operationId: 'GlobalSupplyChainLogisticsWarehouseInventoryService_GetShippingManifestByConsignmentId',
        parameters: [],
      };

      const usedNames = new Set<string>();
      const nameA = generateToolName(opA, usedNames);
      usedNames.add(nameA);
      const nameB = generateToolName(opB, usedNames);

      expect(nameA.length).toBeLessThanOrEqual(64);
      expect(nameB.length).toBeLessThanOrEqual(64);
      expect(nameA).not.toBe(nameB);
      expect(nameA).toContain('container_id');
      expect(nameB).toContain('consignment_id');
    });

    it('preserves root domain and leaf when paths are deep, preventing sibling collisions', () => {
      const userSettings: ParsedOperation = {
        method: 'get',
        path: '/api/v1/users/{userId}/settings',
        parameters: [],
      };
      const orgSettings: ParsedOperation = {
        method: 'get',
        path: '/api/v1/organizations/{orgId}/settings',
        parameters: [],
      };
      const projSettings: ParsedOperation = {
        method: 'get',
        path: '/api/v1/organizations/{orgId}/workspaces/{wsId}/projects/{pId}/settings',
        parameters: [],
      };

      const { tools, mappings } = buildTools([userSettings, orgSettings, projSettings]);

      expect(tools).toHaveLength(3);
      expect(mappings.size).toBe(3);

      const names = tools.map((t) => t.name);
      // All must be distinct and <= 64 chars
      expect(new Set(names).size).toBe(3);
      names.forEach((name) => expect(name.length).toBeLessThanOrEqual(64));

      // Each retains its root context
      expect(names.some((n) => n.includes('users') && n.includes('settings'))).toBe(true);
      expect(names.some((n) => n.includes('organizations') && n.includes('settings'))).toBe(true);
    });

    it('correctly maps all 17 sample API endpoints to 17 unique tools without drops', () => {
      const operations: ParsedOperation[] = [
        // Auth
        { method: 'post', path: '/api/v1/auth/login', parameters: [] },
        { method: 'post', path: '/api/v1/auth/logout', parameters: [] },
        { method: 'post', path: '/api/v1/auth/refresh', parameters: [] },
        // Users
        { method: 'get', path: '/api/v1/users', parameters: [] },
        { method: 'post', path: '/api/v1/users', parameters: [] },
        { method: 'get', path: '/api/v1/users/{user_id}', parameters: [] },
        { method: 'put', path: '/api/v1/users/{user_id}', parameters: [] },
        { method: 'delete', path: '/api/v1/users/{user_id}', parameters: [] },
        { method: 'get', path: '/api/v1/users/{user_id}/settings', parameters: [] },
        // Organizations
        { method: 'get', path: '/api/v1/organizations', parameters: [] },
        { method: 'post', path: '/api/v1/organizations', parameters: [] },
        { method: 'get', path: '/api/v1/organizations/{org_id}/settings', parameters: [] },
        { method: 'get', path: '/api/v1/organizations/{org_id}/members', parameters: [] },
        { method: 'post', path: '/api/v1/organizations/{org_id}/members', parameters: [] },
        // Deeply Nested Projects
        { method: 'get', path: '/api/v1/organizations/{org_id}/workspaces/{ws_id}/projects', parameters: [] },
        { method: 'post', path: '/api/v1/organizations/{org_id}/workspaces/{ws_id}/projects', parameters: [] },
        { method: 'get', path: '/api/v1/organizations/{org_id}/workspaces/{ws_id}/projects/{p_id}/settings', parameters: [] },
      ];

      const { tools, mappings } = buildTools(operations);

      // Crucial test: all 17 must be preserved, no dropping down to 7
      expect(tools).toHaveLength(17);
      expect(mappings.size).toBe(17);

      for (const tool of tools) {
        expect(tool.name.length).toBeLessThanOrEqual(64);
        expect(tool.name).toMatch(/^[a-zA-Z0-9_]+$/);
      }
    });

    it('generates consistent deterministic hash for the same input', () => {
      const hash1 = getDeterministicHash('get:/api/v1/users/test', 6);
      const hash2 = getDeterministicHash('get:/api/v1/users/test', 6);
      const hash3 = getDeterministicHash('post:/api/v1/users/test', 6);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(6);
      expect(hash1).not.toBe(hash3);
    });
  });
});
