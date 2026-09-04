import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyTokenMock } = vi.hoisted(() => ({
  verifyTokenMock: vi.fn(),
}));

vi.mock('@clerk/backend', () => ({
  verifyToken: verifyTokenMock,
}));

import { requireClerkAuth } from './auth';

type TestResponse = {
  statusCode: number;
  body: Record<string, string> | null;
  status: (code: number) => TestResponse;
  json: (body: Record<string, string>) => TestResponse;
};

const response = (): TestResponse => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const originalSecretKey = process.env.CLERK_SECRET_KEY;
const originalAuthorizedParties = process.env.CLERK_AUTHORIZED_PARTIES;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CLERK_SECRET_KEY = 'test-secret';
  process.env.CLERK_AUTHORIZED_PARTIES = 'https://tools.example.com';
});

afterEach(() => {
  if (originalSecretKey === undefined) delete process.env.CLERK_SECRET_KEY;
  else process.env.CLERK_SECRET_KEY = originalSecretKey;

  if (originalAuthorizedParties === undefined) delete process.env.CLERK_AUTHORIZED_PARTIES;
  else process.env.CLERK_AUTHORIZED_PARTIES = originalAuthorizedParties;
});

describe('Clerk API authentication', () => {
  it('rejects a request without a bearer token', async () => {
    const res = response();

    await expect(requireClerkAuth({ headers: {} }, res)).resolves.toBe(false);

    expect(res.statusCode).toBe(401);
    expect(res.body?.error).toBe('unauthorized');
    expect(verifyTokenMock).not.toHaveBeenCalled();
  });

  it('rejects a request when authentication is not configured', async () => {
    delete process.env.CLERK_SECRET_KEY;
    const res = response();

    await expect(
      requireClerkAuth({ headers: { authorization: 'Bearer session-token' } }, res)
    ).resolves.toBe(false);

    expect(res.statusCode).toBe(500);
    expect(res.body?.error).toBe('authentication_unavailable');
    expect(verifyTokenMock).not.toHaveBeenCalled();
  });

  it('accepts a verified Clerk session token', async () => {
    verifyTokenMock.mockResolvedValue({ sub: 'user_123' });
    const res = response();

    await expect(
      requireClerkAuth({ headers: { authorization: 'Bearer session-token' } }, res)
    ).resolves.toBe(true);

    expect(verifyTokenMock).toHaveBeenCalledWith('session-token', {
      secretKey: 'test-secret',
      authorizedParties: ['https://tools.example.com'],
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects an invalid Clerk session token', async () => {
    verifyTokenMock.mockRejectedValue(new Error('invalid token'));
    const res = response();

    await expect(
      requireClerkAuth({ headers: { authorization: 'Bearer invalid-token' } }, res)
    ).resolves.toBe(false);

    expect(res.statusCode).toBe(401);
    expect(res.body?.error).toBe('unauthorized');
  });
});
