import { parseCliArgs, buildConfig } from '../../src/core/config.js';

describe('config', () => {
  describe('parseCliArgs', () => {
    it('should handle empty args', () => {
      expect(parseCliArgs([])).toEqual({});
    });

    it('should parse --key value format', () => {
      expect(parseCliArgs(['--foo', 'bar', '--baz', 'qux'])).toEqual({
        foo: 'bar',
        baz: 'qux'
      });
    });

    it('should parse --key=value format', () => {
      expect(parseCliArgs(['--foo=bar', '--baz=qux'])).toEqual({
        foo: 'bar',
        baz: 'qux'
      });
    });

    it('should parse mixed args', () => {
      expect(parseCliArgs(['--foo', 'bar', '--baz=qux'])).toEqual({
        foo: 'bar',
        baz: 'qux'
      });
    });

    it('should handle flags without values', () => {
      // '--foo' is followed by another flag, so it shouldn't capture '--bar=baz' as its value
      expect(parseCliArgs(['--foo', '--bar=baz'])).toEqual({
        bar: 'baz'
      });
    });

    it('should ignore args not starting with --', () => {
      expect(parseCliArgs(['foo', 'bar', '--baz', 'qux'])).toEqual({
        baz: 'qux'
      });
    });
  });

  describe('buildConfig', () => {
    it('should apply defaults', () => {
      const config = buildConfig({ specUrl: 'http://example.com/openapi.json' });
      expect(config).toEqual({
        specUrl: 'http://example.com/openapi.json',
        baseUrl: undefined,
        auth: {},
        timeout: 30000,
        defaultHeaders: {}
      });
    });

    it('should allow partial overrides', () => {
      const config = buildConfig({
        specUrl: 'http://example.com/openapi.json',
        timeout: 10000
      });
      expect(config.timeout).toBe(10000);
      expect(config.auth).toEqual({});
    });

    it('should apply all overrides', () => {
      const config = buildConfig({
        specUrl: 'http://example.com/openapi.json',
        baseUrl: 'http://example.com/api',
        auth: { bearerToken: 'test-token' },
        timeout: 5000,
        defaultHeaders: { 'X-Custom': 'test' }
      });
      expect(config).toEqual({
        specUrl: 'http://example.com/openapi.json',
        baseUrl: 'http://example.com/api',
        auth: { bearerToken: 'test-token' },
        timeout: 5000,
        defaultHeaders: { 'X-Custom': 'test' }
      });
    });
  });
});
