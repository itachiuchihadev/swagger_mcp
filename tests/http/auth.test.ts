import { getAuthHeaders } from '../../src/http/auth.js';
import { vi } from 'vitest';

describe('auth', () => {
  describe('getAuthHeaders', () => {
    it('should return empty object if no auth configured', () => {
      expect(getAuthHeaders({})).toEqual({});
    });

    it('should return Authorization Bearer header for bearer token', () => {
      expect(getAuthHeaders({ bearerToken: 'my-token' })).toEqual({
        Authorization: 'Bearer my-token'
      });
    });

    it('should return default X-API-Key header for api key', () => {
      expect(getAuthHeaders({ apiKey: 'my-api-key' })).toEqual({
        'X-API-Key': 'my-api-key'
      });
    });

    it('should return custom header for api key if specified', () => {
      expect(getAuthHeaders({ apiKey: 'my-api-key', apiKeyHeader: 'X-Custom-Key' })).toEqual({
        'X-Custom-Key': 'my-api-key'
      });
    });

    it('should return Basic Authorization header', () => {
      expect(getAuthHeaders({ basicUser: 'user', basicPass: 'pass' })).toEqual({
        Authorization: 'Basic dXNlcjpwYXNz'
      });
    });

    it('should generate Basic Authorization header even with empty password', () => {
      expect(getAuthHeaders({ basicUser: 'user', basicPass: '' })).toEqual({
        Authorization: 'Basic dXNlcjo='
      });
    });

    it('should handle Bearer and API key combination', () => {
      expect(getAuthHeaders({ bearerToken: 'my-token', apiKey: 'my-key' })).toEqual({
        Authorization: 'Bearer my-token',
        'X-API-Key': 'my-key'
      });
    });

    it('should overwrite Bearer with Basic auth and log a warning', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const headers = getAuthHeaders({ bearerToken: 'my-token', basicUser: 'user', basicPass: 'pass' });
      
      expect(headers).toEqual({
        Authorization: 'Basic dXNlcjpwYXNz'
      });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Both Bearer token and Basic auth are configured')
      );
      consoleSpy.mockRestore();
    });

    it('should handle all three configured simultaneously', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const headers = getAuthHeaders({
        bearerToken: 'my-token',
        basicUser: 'user',
        basicPass: 'pass',
        apiKey: 'my-api-key'
      });
      
      expect(headers).toEqual({
        Authorization: 'Basic dXNlcjpwYXNz',
        'X-API-Key': 'my-api-key'
      });
      consoleSpy.mockRestore();
    });
  });
});
