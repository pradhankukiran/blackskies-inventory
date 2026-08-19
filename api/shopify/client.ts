// Shared Shopify Admin API client for Vercel serverless functions.

export const API_VERSION = '2026-07';

type CachedToken = {
  shop: string;
  clientId: string;
  token: string;
  expiresAt: number;
};

let cachedToken: CachedToken | null = null;

export class ShopifyApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'ShopifyApiError';
  }
}

export type ShopifyClient = {
  shop: string;
  gql: <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;
};

async function getAccessToken(
  shop: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  if (
    cachedToken &&
    cachedToken.shop === shop &&
    cachedToken.clientId === clientId &&
    cachedToken.expiresAt > Date.now() + 60_000
  ) {
    return cachedToken.token;
  }

  const response = await fetch(
    `https://${shop}.myshopify.com/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new ShopifyApiError(
      `Token request failed: ${response.status} ${text}`,
      response.status
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    shop,
    clientId,
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

async function graphql<T>(
  shop: string,
  token: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(
    `https://${shop}.myshopify.com/admin/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  const payload = (await response.json().catch(() => null)) as
    | { data?: T; errors?: unknown }
    | null;

  if (!response.ok) {
    throw new ShopifyApiError(
      `Shopify request failed: ${response.status} ${JSON.stringify(payload)}`,
      response.status
    );
  }

  if (payload?.errors) {
    throw new ShopifyApiError(
      `GraphQL errors: ${JSON.stringify(payload.errors)}`,
      502
    );
  }

  if (!payload?.data) {
    throw new ShopifyApiError('Shopify returned an empty GraphQL response', 502);
  }

  return payload.data;
}

export async function getShopifyClient(): Promise<ShopifyClient> {
  const shop = process.env.SHOPIFY_SHOP_DOMAIN;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!shop || !clientId || !clientSecret) {
    throw new ShopifyApiError(
      'Missing one of: SHOPIFY_SHOP_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET',
      500
    );
  }

  const token = await getAccessToken(shop, clientId, clientSecret);

  return {
    shop,
    gql: <T>(query: string, variables?: Record<string, unknown>) =>
      graphql<T>(shop, token, query, variables),
  };
}
