import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getShopifyClientMock, ShopifyApiErrorMock } = vi.hoisted(() => {
  class ShopifyApiErrorMock extends Error {
    constructor(message: string, public readonly status?: number) {
      super(message);
      this.name = 'ShopifyApiError';
    }
  }

  return { getShopifyClientMock: vi.fn(), ShopifyApiErrorMock };
});

vi.mock('./client.js', () => ({
  getShopifyClient: getShopifyClientMock,
  ShopifyApiError: ShopifyApiErrorMock,
}));

import handler from './barcodes';
import { mapBarcodeVariant } from './barcodes.logic';

type TestResponse = {
  statusCode: number;
  body: Record<string, unknown> | null;
  headers: Record<string, string>;
  status: (code: number) => TestResponse;
  json: (body: Record<string, unknown>) => TestResponse;
  setHeader: (name: string, value: string) => void;
};

const response = (): TestResponse => ({
  statusCode: 200,
  body: null,
  headers: {},
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
  setHeader(name, value) {
    this.headers[name] = value;
  },
});

const variant = (overrides: Record<string, unknown> = {}) => ({
  id: 'gid://shopify/ProductVariant/1',
  sku: '000SKU-01',
  barcode: '0123456789012',
  selectedOptions: [
    { name: 'Colour', value: 'Midnight blue' },
    { name: 'Größe', value: 'M' },
  ],
  product: {
    title: 'The Article',
    colorName: { value: 'Product-level color name' },
    color: { jsonValue: ['Product-level colour'] },
    standardColor: { jsonValue: [] },
  },
  ...overrides,
});

const productVariantsPage = (
  nodes: unknown[],
  hasNextPage = false,
  endCursor: string | null = null
) => ({
  productVariants: {
    pageInfo: { hasNextPage, endCursor },
    edges: nodes.map((node) => ({ node })),
  },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Shopify barcode endpoint', () => {
  it('accepts GET only and disables caching', async () => {
    const res = response();
    await handler({ method: 'POST' }, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers).toEqual({ 'Cache-Control': 'no-store', Allow: 'GET' });
    expect(res.body).toEqual({
      error: 'method_not_allowed',
      message: 'Use GET for this endpoint.',
    });
    expect(getShopifyClientMock).not.toHaveBeenCalled();
  });

  it('maps Shopify product and option fields without changing string identifiers', () => {
    expect(
      mapBarcodeVariant(
        variant({
          id: 'gid://shopify/ProductVariant/0001',
          sku: '000SKU-01',
          barcode: '0123456789012',
          selectedOptions: [
            { name: 'Farbe', value: 'Schwarz' },
            { name: 'Groesse', value: '001' },
          ],
          product: {
            title: 'The Article',
            colorName: { value: 'Black' },
            color: { jsonValue: ['Black'] },
            standardColor: { jsonValue: [] },
          },
        })
      )
    ).toEqual({
      variantId: 'gid://shopify/ProductVariant/0001',
      sku: '000SKU-01',
      ean: '0123456789012',
      articleName: 'The Article',
      color: 'Schwarz',
      size: '001',
    });
  });

  it('uses custom.colorname_en when the variant has no color option', () => {
    expect(
      mapBarcodeVariant(
        variant({
          selectedOptions: [{ name: 'Size', value: 'M' }],
          product: {
            title: 'The Article',
            colorName: { value: 'Black denim' },
            color: { jsonValue: ['multi-coloured', 'black denim'] },
            standardColor: { jsonValue: [] },
          },
        })
      )
    ).toMatchObject({
      color: 'Black denim',
      size: 'M',
    });
  });

  it('uses the product custom.color metafield list after custom.colorname_en', () => {
    expect(
      mapBarcodeVariant(
        variant({
          selectedOptions: [{ name: 'Size', value: 'M' }],
          product: {
            title: 'The Article',
            colorName: null,
            color: { jsonValue: ['multi-coloured', 'black denim'] },
            standardColor: { jsonValue: [] },
          },
        })
      )
    ).toMatchObject({
      color: 'multi-coloured / black denim',
      size: 'M',
    });
  });

  it('uses the variant Color option over every product color metafield', () => {
    expect(
      mapBarcodeVariant(
        variant({
          selectedOptions: [
            { name: 'Color', value: 'Midnight blue' },
            { name: 'Size', value: 'M' },
          ],
          product: {
            title: 'The Article',
            colorName: { value: 'Navy' },
            color: { jsonValue: ['Blue'] },
            standardColor: { jsonValue: ['gid://shopify/Metaobject/100'] },
          },
        }),
        new Map([['gid://shopify/Metaobject/100', 'Ocean blue']])
      )
    ).toMatchObject({
      color: 'Midnight blue',
      size: 'M',
    });
  });

  it('uses the standard Shopify color-pattern metaobject display name last', () => {
    expect(
      mapBarcodeVariant(
        variant({
          selectedOptions: [{ name: 'Size', value: 'M' }],
          product: {
            title: 'The Article',
            colorName: null,
            color: { jsonValue: [] },
            standardColor: { jsonValue: ['gid://shopify/Metaobject/100'] },
          },
        }),
        new Map([['gid://shopify/Metaobject/100', 'Ocean blue']])
      )
    ).toMatchObject({ color: 'Ocean blue', size: 'M' });
  });

  it('uses Size before other variant options, then the first meaningful option, then One Size', () => {
    expect(
      mapBarcodeVariant(
        variant({
          selectedOptions: [
            { name: 'Color', value: 'Black' },
            { name: 'Bracelet Size', value: '16 cm' },
            { name: 'Size', value: 'M' },
          ],
        })
      )
    ).toMatchObject({ size: 'M' });

    expect(
      mapBarcodeVariant(
        variant({
          selectedOptions: [
            { name: 'Color', value: 'Black' },
            { name: 'Chain Length', value: '45 cm' },
          ],
        })
      )
    ).toMatchObject({ size: '45 cm' });

    expect(
      mapBarcodeVariant(
        variant({
          selectedOptions: [{ name: 'Title', value: 'Default Title' }],
        })
      )
    ).toMatchObject({ size: 'One Size' });

    expect(
      mapBarcodeVariant(
        variant({
          selectedOptions: [{ name: 'Color', value: 'Black' }],
        })
      )
    ).toMatchObject({ size: '' });
  });

  it('requests every product-variant page and returns mapped rows', async () => {
    const gql = vi
      .fn()
      .mockResolvedValueOnce(productVariantsPage([variant()], true, 'cursor-1'))
      .mockResolvedValueOnce(
        productVariantsPage([
          variant({
            id: 'gid://shopify/ProductVariant/2',
            sku: '002',
            barcode: '4006381333931',
            selectedOptions: [
              { name: 'Color', value: 'White' },
              { name: 'Size', value: 'L' },
            ],
          }),
        ])
      );
    getShopifyClientMock.mockResolvedValue({ shop: 'test-shop', gql });
    const res = response();

    await handler({ method: 'GET' }, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.body).toEqual({
      syncedAt: expect.any(String),
      count: 2,
      rows: [
        {
          variantId: 'gid://shopify/ProductVariant/1',
          sku: '000SKU-01',
          ean: '0123456789012',
          articleName: 'The Article',
          color: 'Midnight blue',
          size: 'M',
        },
        {
          variantId: 'gid://shopify/ProductVariant/2',
          sku: '002',
          ean: '4006381333931',
          articleName: 'The Article',
          color: 'White',
          size: 'L',
        },
      ],
    });
    expect(gql).toHaveBeenCalledTimes(2);
    expect(gql.mock.calls[0][0]).toContain('productVariants(first: 250, after: $cursor)');
    expect(gql.mock.calls[0][0]).toContain(
      'colorName: metafield(namespace: "custom", key: "colorname_en")'
    );
    expect(gql.mock.calls[0][0]).toContain(
      'color: metafield(namespace: "custom", key: "color")'
    );
    expect(gql.mock.calls[0][0]).toContain(
      'standardColor: metafield(namespace: "shopify", key: "color-pattern")'
    );
    expect(gql.mock.calls[0][0]).toContain('jsonValue');
    expect(gql.mock.calls[0][1]).toEqual({ cursor: null });
    expect(gql.mock.calls[1][1]).toEqual({ cursor: 'cursor-1' });
  });

  it('resolves Shopify color-pattern metaobject display names for mapped rows', async () => {
    const colorId = 'gid://shopify/Metaobject/100';
    const gql = vi
      .fn()
      .mockResolvedValueOnce(
        productVariantsPage([
          variant({
            selectedOptions: [{ name: 'Bracelet Size', value: '16 cm' }],
            product: {
              title: 'The Article',
              colorName: null,
              color: { jsonValue: [] },
              standardColor: { jsonValue: [colorId] },
            },
          }),
        ])
      )
      .mockResolvedValueOnce({
        nodes: [{ id: colorId, displayName: 'Ocean blue' }],
      });
    getShopifyClientMock.mockResolvedValue({ shop: 'test-shop', gql });
    const res = response();

    await handler({ method: 'GET' }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      count: 1,
      rows: [
        expect.objectContaining({
          color: 'Ocean blue',
          size: '16 cm',
        }),
      ],
    });
    expect(gql).toHaveBeenCalledTimes(2);
    expect(gql.mock.calls[1][0]).toContain('nodes(ids: $ids)');
    expect(gql.mock.calls[1][1]).toEqual({ ids: [colorId] });
  });

  it('returns the Shopify API status and a structured error response', async () => {
    getShopifyClientMock.mockRejectedValue(
      new ShopifyApiErrorMock('Shopify access token expired.', 401)
    );
    const res = response();

    await handler({ method: 'GET' }, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      error: 'shopify_request_failed',
      message: 'Shopify access token expired.',
    });
  });

  it('uses a 500 structured error for an unknown failure', async () => {
    getShopifyClientMock.mockRejectedValue(new Error('Network unavailable.'));
    const res = response();

    await handler({ method: 'GET' }, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: 'shopify_request_failed',
      message: 'Network unavailable.',
    });
  });
});
