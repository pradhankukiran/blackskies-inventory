import { verifyToken } from '@clerk/backend';

type HeaderValue = string | string[] | undefined;

type AuthRequest = {
  headers?: Record<string, HeaderValue>;
};

type AuthResponse = {
  status: (statusCode: number) => AuthResponse;
  json: (body: Record<string, string>) => unknown;
};

function readHeader(req: AuthRequest, name: string): string | undefined {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function unauthorized(res: AuthResponse) {
  return res.status(401).json({
    error: 'unauthorized',
    message: 'Sign in to use this tool.',
  });
}

function authorizedParties(): string[] | undefined {
  const configured = process.env.CLERK_AUTHORIZED_PARTIES
    ?.split(',')
    .map((party) => party.trim())
    .filter(Boolean);

  if (configured?.length) return configured;

  const vercelHosts = [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL]
    .filter((host): host is string => Boolean(host))
    .map((host) => `https://${host}`);

  return vercelHosts.length ? Array.from(new Set(vercelHosts)) : undefined;
}

export async function requireClerkAuth(req: AuthRequest, res: AuthResponse): Promise<boolean> {
  const authorization = readHeader(req, 'authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  if (!token) {
    unauthorized(res);
    return false;
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.error('Clerk authentication is missing CLERK_SECRET_KEY.');
    res.status(500).json({
      error: 'authentication_unavailable',
      message: 'Authentication is temporarily unavailable.',
    });
    return false;
  }

  try {
    const payload = await verifyToken(token, {
      secretKey,
      authorizedParties: authorizedParties(),
    });

    if (!payload.sub) {
      unauthorized(res);
      return false;
    }

    return true;
  } catch (error) {
    console.warn('Clerk token verification failed.', error);
    unauthorized(res);
    return false;
  }
}
