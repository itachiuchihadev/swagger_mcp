import { describe, it, expect } from 'vitest';
import { generateToolName, buildTools } from '../../src/parser/tool-builder.js';
import { ParsedOperation } from '../../src/core/types.js';

describe('tool-builder', () => {
  describe('generateToolName', () => {
    it('uses operationId when present (preserves casing)', () => {
      const op: ParsedOperation = {
        method: 'get',
        path: '/users',
        operationId: 'GetUserById',
        parameters: []
      };
      const usedNames = new Set<string>();
      expect(generateToolName(op, usedNames)).toBe('GetUserById');
    });

    it('uses tag + method + path when no operationId (lowercased)', () => {
      const op: ParsedOperation = {
        method: 'get',
        path: '/users',
        tag: 'Users',
        parameters: []
      };
      const usedNames = new Set<string>();
      expect(generateToolName(op, usedNames)).toBe('users_get_users');
    });

    it('uses method + path as fallback (lowercased)', () => {
      const op: ParsedOperation = {
        method: 'get',
        path: '/users',
        parameters: []
      };
      const usedNames = new Set<string>();
      expect(generateToolName(op, usedNames)).toBe('get_users');
    });

    it('sanitizes special characters (/, {, }, -, .)', () => {
      const op: ParsedOperation = {
        method: 'post',
        path: '/users/{id}/update-status.json',
        parameters: []
      };
      const usedNames = new Set<string>();
      expect(generateToolName(op, usedNames)).toBe('post_users_id_update_status_json');
    });

    it('handles uniqueness collision (appends _2, _3 etc)', () => {
      const op: ParsedOperation = {
        method: 'get',
        path: '/users',
        operationId: 'getUsers',
        parameters: []
      };
      const usedNames = new Set<string>(['getUsers', 'getUsers_2']);
      expect(generateToolName(op, usedNames)).toBe('getUsers_3');
    });

    it('handles empty/invalid operationIds', () => {
      const op: ParsedOperation = {
        method: 'get',
        path: '/users',
        operationId: '!@#$',
        parameters: []
      };
      const usedNames = new Set<string>();
      expect(generateToolName(op, usedNames)).toBe('unnamed_tool');
    });

    it('respects max 64 char limit', () => {
      const op: ParsedOperation = {
        method: 'get',
        path: '/users',
        operationId: 'a'.repeat(100),
        parameters: []
      };
      const usedNames = new Set<string>();
      expect(generateToolName(op, usedNames).length).toBe(64);
      expect(generateToolName(op, usedNames)).toBe('a'.repeat(64));
    });

    it('handles uniqueness collision near the length limit', () => {
      const op: ParsedOperation = {
        method: 'get',
        path: '/users',
        operationId: 'a'.repeat(100),
        parameters: []
      };
      const longName = 'a'.repeat(64);
      const usedNames = new Set<string>([longName]);
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
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('getUser');
      expect(tools[0].inputSchema.properties).toHaveProperty('id');
      expect((tools[0].inputSchema.properties as any).id.description).toContain('(path parameter)');
      expect(tools[0].inputSchema.required).toEqual(['id']);
      expect(mappings.get('getUser')?.operation).toEqual(op);
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
});
