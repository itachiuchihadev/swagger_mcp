import { describe, it, expect } from 'vitest';
import { resolveBaseUrl } from '../src/server.js';

describe('resolveBaseUrl', () => {
  it('Priority 1: configBaseUrl is returned when provided', () => {
    expect(resolveBaseUrl('http://example.com/spec.json', 'http://config.com', 'http://spec.com')).toBe('http://config.com');
  });

  it('Priority 2: specBaseUrl (absolute URL) returned when no config override', () => {
    expect(resolveBaseUrl('http://example.com/spec.json', undefined, 'https://spec.com/api')).toBe('https://spec.com/api');
  });

  it('Priority 2: specBaseUrl (relative path) combined with spec URL origin', () => {
    expect(resolveBaseUrl('http://example.com/docs/spec.json', undefined, '/v1/api')).toBe('http://example.com/v1/api');
  });

  it('Priority 3: spec URL origin used when no config or spec base URL', () => {
    expect(resolveBaseUrl('https://example.com/docs/api.yaml')).toBe('https://example.com');
  });

  it('Trailing slashes are stripped', () => {
    expect(resolveBaseUrl('http://example.com/spec', 'http://config.com///')).toBe('http://config.com');
    expect(resolveBaseUrl('http://example.com/spec', undefined, 'http://spec.com/')).toBe('http://spec.com');
    expect(resolveBaseUrl('http://example.com/spec', undefined, '/api/v1/')).toBe('http://example.com/api/v1');
  });

  it('Invalid spec URL falls back to localhost', () => {
    expect(resolveBaseUrl('not-a-url')).toBe('http://localhost');
  });

  it('configBaseUrl takes priority over specBaseUrl', () => {
    expect(resolveBaseUrl('http://example.com', 'http://override.com', 'http://spec.com')).toBe('http://override.com');
  });
});
