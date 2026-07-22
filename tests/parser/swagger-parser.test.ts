import { describe, it, expect } from 'vitest';
import { sanitizeSchema } from '../../src/parser/swagger-parser.js';

describe('sanitizeSchema', () => {
  it('passes through basic schema properties', () => {
    const schema = {
      type: 'string',
      format: 'date-time',
      enum: ['a', 'b'],
      description: 'A basic string'
    };
    expect(sanitizeSchema(schema)).toEqual(schema);
  });

  it('strips x- extensions', () => {
    const schema = {
      type: 'string',
      'x-amazon-apigateway-integration': { type: 'aws_proxy' },
      'x-internal-id': 123
    };
    expect(sanitizeSchema(schema)).toEqual({ type: 'string' });
  });

  it('strips xml definitions', () => {
    const schema = {
      type: 'object',
      xml: { name: 'Animal' },
      properties: {
        name: { type: 'string' }
      }
    };
    expect(sanitizeSchema(schema)).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' }
      }
    });
  });

  it('strips null/undefined values', () => {
    const schema = {
      type: 'string',
      format: undefined,
      example: null
    };
    expect(sanitizeSchema(schema)).toEqual({ type: 'string' });
  });

  it('recursively sanitizes properties', () => {
    const schema = {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          'x-foo': 'bar',
          properties: {
            name: { type: 'string', 'x-bar': 'baz' }
          }
        }
      }
    };
    expect(sanitizeSchema(schema)).toEqual({
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            name: { type: 'string' }
          }
        }
      }
    });
  });

  it('recursively sanitizes items (arrays)', () => {
    const schema = {
      type: 'array',
      items: {
        type: 'object',
        'x-extension': true,
        properties: {
          id: { type: 'integer' }
        }
      }
    };
    expect(sanitizeSchema(schema)).toEqual({
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' }
        }
      }
    });
  });

  it('recursively sanitizes additionalProperties', () => {
    const schema = {
      type: 'object',
      additionalProperties: {
        type: 'string',
        'x-foo': 'bar'
      }
    };
    expect(sanitizeSchema(schema)).toEqual({
      type: 'object',
      additionalProperties: {
        type: 'string'
      }
    });
  });

  it('handles circular references gracefully', () => {
    const schema1: Record<string, unknown> = { type: 'object' };
    const schema2: Record<string, unknown> = { type: 'object' };
    schema1.properties = { child: schema2 };
    schema2.properties = { parent: schema1 };

    const sanitized = sanitizeSchema(schema1);

    expect(sanitized).toEqual({
      type: 'object',
      properties: {
        child: {
          type: 'object',
          properties: {
            parent: {
              type: 'object',
              description: '(circular reference)'
            }
          }
        }
      }
    });
  });
});
