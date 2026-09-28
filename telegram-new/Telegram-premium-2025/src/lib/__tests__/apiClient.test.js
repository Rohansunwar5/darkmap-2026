import { describe, it, expect, beforeEach } from 'vitest';
import apiClient from '../apiClient';

// Reach the actual interceptor functions axios registered.
const requestInterceptor = apiClient.interceptors.request.handlers[0].fulfilled;
const responseRejected = apiClient.interceptors.response.handlers[0].rejected;

beforeEach(() => {
  localStorage.clear();
});

describe('apiClient interceptors', () => {
  it('attaches the Bearer token when one is stored', () => {
    localStorage.setItem('accessToken', 'tok123');
    const cfg = requestInterceptor({ headers: {} });
    expect(cfg.headers.Authorization).toBe('Bearer tok123');
  });

  it('omits Authorization when there is no token', () => {
    const cfg = requestInterceptor({ headers: {} });
    expect(cfg.headers.Authorization).toBeUndefined();
  });

  it('clears the stored token on a 401 response', async () => {
    localStorage.setItem('accessToken', 'tok123');
    await expect(responseRejected({ response: { status: 401 } })).rejects.toBeDefined();
    expect(localStorage.getItem('accessToken')).toBeNull();
  });
});
