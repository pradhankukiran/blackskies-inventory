import { beforeEach, describe, expect, it, vi } from "vitest";

const { getShopifyClientMock, requireClerkAuthMock } = vi.hoisted(() => ({
  getShopifyClientMock: vi.fn(),
  requireClerkAuthMock: vi.fn(),
}));

vi.mock("./client.js", () => ({
  getShopifyClient: getShopifyClientMock,
  ShopifyApiError: class ShopifyApiError extends Error {
    constructor(message: string, public readonly status?: number) {
      super(message);
      this.name = "ShopifyApiError";
    }
  },
}));

vi.mock("./auth.js", () => ({
  requireClerkAuth: requireClerkAuthMock,
}));

import handler, { parseUpdateSelection } from "./sale-prices";

type TestResponse = {
  statusCode: number;
  body: Record<string, unknown> | null;
  headers: Record<string, string>;
  status: (code: number) => TestResponse;
  json: (body: Record<string, unknown>) => TestResponse;
  setHeader: (name: string, value: string) => void;
};

const response = (): TestResponse => {
  const res: TestResponse = {
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
  };
  return res;
};

const validRows = [
  {
    rowNumber: 1,
    statusDetail: "ZABLO_646",
    country: "de",
    currency: "EUR",
    sku: "AK-R-PUR-03-11",
    ean: "4251812338836",
    regularPrice: 33.99,
  },
];

const firstProductId = "gid://shopify/Product/1";
const secondProductId = "gid://shopify/Product/2";

const configureShopify = (
  variants: unknown[],
  metafieldSetUserErrors: Array<{
    field: string[] | null;
    message: string;
    code: string | null;
  }> = []
) => {
  const gql = vi.fn(async (query: string, variables?: Record<string, unknown>) => {
    if (query.includes("metafieldDefinitions")) {
      return {
        metafieldDefinitions: {
          nodes: [{ id: "definition-id", name: "Sale Price Zalando", type: { name: "number_decimal" } }],
        },
      };
    }

    if (query.includes("productVariants")) {
      return {
        productVariants: {
          pageInfo: { hasNextPage: false, endCursor: null },
          edges: variants.map((node) => ({ node })),
        },
      };
    }

    if (query.includes("metafieldsSet")) {
      const metafields = (variables?.metafields as unknown[] | undefined) ?? [];
      return {
        metafieldsSet: {
          metafields: metafieldSetUserErrors.length
            ? []
            : metafields.map((_, index) => ({ id: `metafield-${index}` })),
          userErrors: metafieldSetUserErrors,
        },
      };
    }

    throw new Error(`Unexpected Shopify query: ${query}`);
  });

  getShopifyClientMock.mockResolvedValue({ shop: "test-shop", gql });
  return gql;
};

const variant = (
  id: string,
  productId: string,
  sku: string,
  barcode: string,
  currentSalePrice?: string,
  compareDigest = "digest-current"
) => ({
  id,
  sku,
  barcode,
  product: {
    id: productId,
    title: `Product ${productId.slice(-1)}`,
    salePriceMetafield:
      currentSalePrice === undefined
        ? null
        : { value: currentSalePrice, compareDigest },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  requireClerkAuthMock.mockResolvedValue(true);
});

describe("Shopify sale-price endpoint safeguards", () => {
  it("accepts POST only", async () => {
    const res = response();
    await handler({ method: "GET", headers: {} }, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe("POST");
  });

  it("rejects unknown actions before contacting Shopify", async () => {
    const res = response();
    await handler(
      { method: "POST", headers: {}, body: { action: "delete", rows: validRows } },
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toBe("invalid_action");
    expect(getShopifyClientMock).not.toHaveBeenCalled();
  });

  it("rejects missing, below-minimum, and above-maximum discounts before contacting Shopify", async () => {
    for (const discountPercentage of [undefined, "10", null, 9, 101]) {
      const res = response();
      const body: Record<string, unknown> = { action: "preview", rows: validRows };
      if (discountPercentage !== undefined) body.discountPercentage = discountPercentage;

      await handler({ method: "POST", headers: {}, body }, res);

      expect(res.statusCode).toBe(400);
      expect(res.body?.message).toMatch(/discount/i);
    }

    expect(getShopifyClientMock).not.toHaveBeenCalled();
  });

  it("uses the supplied discount percentage when preparing a preview", async () => {
    const gql = configureShopify([
      variant("gid://shopify/ProductVariant/1", firstProductId, validRows[0].sku, validRows[0].ean),
    ]);
    const res = response();

    await handler(
      {
        method: "POST",
        headers: {},
        body: { action: "preview", discountPercentage: 25, rows: validRows },
      },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body?.discountPercentage).toBe(25);
    expect(res.body?.products).toEqual([
      expect.objectContaining({ productId: firstProductId, salePrice: "25.49" }),
    ]);
    expect(gql.mock.calls.some(([query]) => query.includes("metafieldsSet"))).toBe(false);
  });

  it("rejects empty row lists before contacting Shopify", async () => {
    const res = response();
    await handler(
      {
        method: "POST",
        headers: {},
        body: { action: "update", discountPercentage: 10, rows: [] },
      },
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toBe("invalid_rows");
    expect(getShopifyClientMock).not.toHaveBeenCalled();
  });

  it("rejects cross-origin updates before contacting Shopify", async () => {
    const res = response();
    await handler(
      {
        method: "POST",
        headers: {
          host: "inventory.example.com",
          origin: "https://attacker.example.com",
        },
        body: {
          action: "update",
          discountPercentage: 10,
          selection: { mode: "all" },
          rows: validRows,
        },
      },
      res
    );

    expect(res.statusCode).toBe(403);
    expect(res.body?.error).toBe("invalid_origin");
    expect(getShopifyClientMock).not.toHaveBeenCalled();
  });

  it("rejects missing update selections before contacting Shopify", async () => {
    const res = response();
    await handler(
      {
        method: "POST",
        headers: {},
        body: { action: "update", discountPercentage: 10, rows: validRows },
      },
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toBe("invalid_selection");
    expect(getShopifyClientMock).not.toHaveBeenCalled();
  });

  it("rejects a stale selected product before any metafield write", async () => {
    const gql = configureShopify([
      variant("gid://shopify/ProductVariant/1", firstProductId, validRows[0].sku, validRows[0].ean),
    ]);
    const res = response();

    await handler(
      {
        method: "POST",
        headers: {},
        body: {
          action: "update",
          discountPercentage: 10,
          selection: {
            mode: "selected",
            products: [
              {
                productId: secondProductId,
                compareDigest: null,
                salePrice: "30.59",
              },
            ],
          },
          rows: validRows,
        },
      },
      res
    );

    expect(res.statusCode).toBe(409);
    expect(res.body?.error).toBe("selection_stale");
    expect(res.body?.invalidProductIds).toEqual([secondProductId]);
    expect(res.body?.rows).toHaveLength(1);
    expect(res.body?.products).toHaveLength(1);
    expect(gql.mock.calls.some(([query]) => query.includes("metafieldsSet"))).toBe(false);
  });

  it("rejects approval when the Shopify value changed after preview", async () => {
    const gql = configureShopify([
      variant(
        "gid://shopify/ProductVariant/1",
        firstProductId,
        validRows[0].sku,
        validRows[0].ean,
        "25.00",
        "digest-after-preview"
      ),
    ]);
    const res = response();

    await handler(
      {
        method: "POST",
        headers: {},
        body: {
          action: "update",
          discountPercentage: 10,
          selection: {
            mode: "selected",
            products: [
              {
                productId: firstProductId,
                compareDigest: "digest-from-preview",
                salePrice: "30.59",
              },
            ],
          },
          rows: validRows,
        },
      },
      res
    );

    expect(res.statusCode).toBe(409);
    expect(res.body?.error).toBe("selection_stale");
    expect(res.body?.invalidProductIds).toEqual([firstProductId]);
    expect(gql.mock.calls.some(([query]) => query.includes("metafieldsSet"))).toBe(false);
  });

  it("uses a manually edited price instead of the calculated price", async () => {
    const gql = configureShopify([
      variant(
        "gid://shopify/ProductVariant/1",
        firstProductId,
        validRows[0].sku,
        validRows[0].ean
      ),
    ]);
    const res = response();

    await handler(
      {
        method: "POST",
        headers: {},
        body: {
          action: "update",
          discountPercentage: 10,
          selection: {
            mode: "selected",
            products: [
              {
                productId: firstProductId,
                compareDigest: null,
                salePrice: "31.00",
              },
            ],
          },
          rows: validRows,
        },
      },
      res
    );

    const mutationCall = gql.mock.calls.find(([query]) => query.includes("metafieldsSet"));
    const mutationVariables = mutationCall?.[1] as
      | { metafields: Array<{ ownerId: string; value: string }> }
      | undefined;

    expect(res.statusCode).toBe(200);
    expect(mutationVariables?.metafields).toEqual([
      expect.objectContaining({ ownerId: firstProductId, value: "31.00" }),
    ]);
    expect(res.body?.products).toEqual([
      expect.objectContaining({ productId: firstProductId, salePrice: "31.00", status: "updated" }),
    ]);
  });

  it("does not offer or write a parent whose metafield is already current", async () => {
    const gql = configureShopify([
      variant(
        "gid://shopify/ProductVariant/1",
        firstProductId,
        validRows[0].sku,
        validRows[0].ean,
        "30.590"
      ),
    ]);
    const res = response();

    await handler(
      {
        method: "POST",
        headers: {},
        body: { action: "preview", discountPercentage: 10, rows: validRows },
      },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body?.summary).toEqual(
      expect.objectContaining({ readyProducts: 0, alreadyUpToDateProducts: 1 })
    );
    expect(res.body?.products).toEqual([
      expect.objectContaining({
        productId: firstProductId,
        status: "already_up_to_date",
        currentSalePrice: "30.590",
      }),
    ]);
    expect(gql.mock.calls.some(([query]) => query.includes("metafieldsSet"))).toBe(false);
  });

  it("updates only selected ready products and leaves the other ready products unchanged", async () => {
    const rows = [
      validRows[0],
      {
        rowNumber: 2,
        statusDetail: "ZABLO_646",
        country: "de",
        currency: "EUR",
        sku: "AK-R-PUR-03-12",
        ean: "4251812338837",
        regularPrice: 49.99,
      },
    ];
    const gql = configureShopify([
      variant("gid://shopify/ProductVariant/1", firstProductId, rows[0].sku, rows[0].ean),
      variant("gid://shopify/ProductVariant/2", secondProductId, rows[1].sku, rows[1].ean),
    ]);
    const res = response();

    await handler(
      {
        method: "POST",
        headers: {},
        body: {
          action: "update",
          discountPercentage: 10,
          selection: {
            mode: "selected",
            products: [
              {
                productId: secondProductId,
                compareDigest: null,
                salePrice: "44.99",
              },
            ],
          },
          rows,
        },
      },
      res
    );

    const mutationCall = gql.mock.calls.find(([query]) => query.includes("metafieldsSet"));
    const mutationVariables = mutationCall?.[1] as
      | {
          metafields: Array<{
            ownerId: string;
            value: string;
            compareDigest: string | null;
          }>;
        }
      | undefined;
    const products = res.body?.products as Array<{ productId: string; status: string }>;

    expect(res.statusCode).toBe(200);
    expect(mutationVariables?.metafields).toEqual([
      expect.objectContaining({
        ownerId: secondProductId,
        value: "44.99",
        compareDigest: null,
      }),
    ]);
    expect(products).toEqual([
      expect.objectContaining({ productId: firstProductId, status: "ready" }),
      expect.objectContaining({ productId: secondProductId, status: "updated" }),
    ]);
  });

  it("updates multiple selected parents in one Shopify request", async () => {
    const rows = [
      validRows[0],
      {
        rowNumber: 2,
        statusDetail: "ZABLO_646",
        country: "de",
        currency: "EUR",
        sku: "AK-R-PUR-03-12",
        ean: "4251812338837",
        regularPrice: 49.99,
      },
    ];
    const gql = configureShopify([
      variant("gid://shopify/ProductVariant/1", firstProductId, rows[0].sku, rows[0].ean),
      variant("gid://shopify/ProductVariant/2", secondProductId, rows[1].sku, rows[1].ean),
    ]);
    const res = response();

    await handler(
      {
        method: "POST",
        headers: {},
        body: {
          action: "update",
          discountPercentage: 10,
          selection: {
            mode: "selected",
            products: [
              {
                productId: firstProductId,
                compareDigest: null,
                salePrice: "30.59",
              },
              {
                productId: secondProductId,
                compareDigest: null,
                salePrice: "44.99",
              },
            ],
          },
          rows,
        },
      },
      res
    );

    const mutationCalls = gql.mock.calls.filter(([query]) => query.includes("metafieldsSet"));
    const mutationVariables = mutationCalls[0]?.[1] as
      | {
          metafields: Array<{
            ownerId: string;
            value: string;
            compareDigest: string | null;
          }>;
        }
      | undefined;

    expect(res.statusCode).toBe(200);
    expect(mutationCalls).toHaveLength(1);
    expect(mutationVariables?.metafields).toEqual([
      expect.objectContaining({
        ownerId: firstProductId,
        value: "30.59",
        compareDigest: null,
      }),
      expect.objectContaining({
        ownerId: secondProductId,
        value: "44.99",
        compareDigest: null,
      }),
    ]);
    expect(res.body?.products).toEqual([
      expect.objectContaining({ productId: firstProductId, status: "updated" }),
      expect.objectContaining({ productId: secondProductId, status: "updated" }),
    ]);
  });

  it("rejects duplicate selected parents before contacting Shopify", async () => {
    const res = response();

    await handler(
      {
        method: "POST",
        headers: {},
        body: {
          action: "update",
          discountPercentage: 10,
          selection: {
            mode: "selected",
            products: [
              { productId: firstProductId, compareDigest: null, salePrice: "30.59" },
              { productId: ` ${firstProductId} `, compareDigest: null, salePrice: "31.00" },
            ],
          },
          rows: validRows,
        },
      },
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toBe("invalid_selection");
    expect(getShopifyClientMock).not.toHaveBeenCalled();
  });

  it("rejects one stale parent in a bulk approval before any metafield write", async () => {
    const rows = [
      validRows[0],
      {
        rowNumber: 2,
        statusDetail: "ZABLO_646",
        country: "de",
        currency: "EUR",
        sku: "AK-R-PUR-03-12",
        ean: "4251812338837",
        regularPrice: 49.99,
      },
    ];
    const gql = configureShopify([
      variant("gid://shopify/ProductVariant/1", firstProductId, rows[0].sku, rows[0].ean),
      variant(
        "gid://shopify/ProductVariant/2",
        secondProductId,
        rows[1].sku,
        rows[1].ean,
        "40.00",
        "digest-after-preview"
      ),
    ]);
    const res = response();

    await handler(
      {
        method: "POST",
        headers: {},
        body: {
          action: "update",
          discountPercentage: 10,
          selection: {
            mode: "selected",
            products: [
              {
                productId: firstProductId,
                compareDigest: null,
                salePrice: "30.59",
              },
              {
                productId: secondProductId,
                compareDigest: "digest-from-preview",
                salePrice: "44.99",
              },
            ],
          },
          rows,
        },
      },
      res
    );

    expect(res.statusCode).toBe(409);
    expect(res.body?.error).toBe("selection_stale");
    expect(res.body?.invalidProductIds).toEqual([secondProductId]);
    expect(gql.mock.calls.some(([query]) => query.includes("metafieldsSet"))).toBe(false);
  });

  it("rejects a concurrent Shopify change instead of overwriting it", async () => {
    const gql = configureShopify(
      [
        variant(
          "gid://shopify/ProductVariant/1",
          firstProductId,
          validRows[0].sku,
          validRows[0].ean,
          "25.00",
          "digest-before-update"
        ),
      ],
      [
        {
          field: ["metafields", "0", "compareDigest"],
          message: "The metafield changed after it was read.",
          code: "STALE_OBJECT",
        },
      ]
    );
    const res = response();

    await handler(
      {
        method: "POST",
        headers: {},
        body: {
          action: "update",
          discountPercentage: 10,
          selection: {
            mode: "selected",
            products: [
              {
                productId: firstProductId,
                compareDigest: "digest-before-update",
                salePrice: "30.59",
              },
            ],
          },
          rows: validRows,
        },
      },
      res
    );

    const mutationCall = gql.mock.calls.find(([query]) => query.includes("metafieldsSet"));
    const mutationVariables = mutationCall?.[1] as
      | { metafields: Array<{ compareDigest: string | null }> }
      | undefined;

    expect(mutationVariables?.metafields[0].compareDigest).toBe(
      "digest-before-update"
    );
    expect(res.statusCode).toBe(200);
    expect(res.body?.products).toEqual([
      expect.objectContaining({
        productId: firstProductId,
        status: "update_conflict",
      }),
    ]);
    expect(res.body?.summary).toEqual(
      expect.objectContaining({ conflictedProducts: 1, updateConflictProducts: 1 })
    );
  });
});

describe("parseUpdateSelection", () => {
  it("accepts multiple parent approvals and normalizes their IDs", () => {
    expect(
      parseUpdateSelection({
        mode: "selected",
        products: [
          {
            productId: " gid://shopify/Product/1 ",
            compareDigest: "digest-preview",
            salePrice: "30.59",
          },
          {
            productId: "gid://shopify/Product/2",
            compareDigest: null,
            salePrice: "15.00",
          },
        ],
      })
    ).toEqual({
      selection: {
        mode: "selected",
        products: [
          {
            productId: "gid://shopify/Product/1",
            compareDigest: "digest-preview",
            salePrice: "30.59",
          },
          {
            productId: "gid://shopify/Product/2",
            compareDigest: null,
            salePrice: "15.00",
          },
        ],
      },
    });
  });

  it("accepts the legacy one-parent selection shape", () => {
    expect(
      parseUpdateSelection({
        mode: "selected",
        productId: " gid://shopify/Product/1 ",
        compareDigest: "digest-preview",
        salePrice: "30.59",
      })
    ).toEqual({
      selection: {
        mode: "selected",
        products: [
          {
            productId: "gid://shopify/Product/1",
            compareDigest: "digest-preview",
            salePrice: "30.59",
          },
        ],
      },
    });
  });

  it("rejects bulk mode, empty product lists, duplicate parents, and missing preview data", () => {
    expect(parseUpdateSelection({ mode: "all" })).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
    expect(parseUpdateSelection({ mode: "selected", products: [] })).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
    expect(
      parseUpdateSelection({ mode: "selected", products: [{ productId: "" }] })
    ).toEqual(expect.objectContaining({ error: expect.any(String) }));
    expect(
      parseUpdateSelection({
        mode: "selected",
        products: [{ productId: "one", compareDigest: null }],
      })
    ).toEqual(expect.objectContaining({ error: expect.any(String) }));
    expect(
      parseUpdateSelection({
        mode: "selected",
        products: [
          { productId: "one", compareDigest: null, salePrice: "15.00" },
          { productId: " one ", compareDigest: null, salePrice: "15.00" },
        ],
      })
    ).toEqual(expect.objectContaining({ error: expect.any(String) }));
  });

  it("requires each manually edited price to be canonical and at least €15.00", () => {
    for (const salePrice of ["15", "15.0", "15.000", "14.99", "14.999", "15,00"]) {
      expect(
        parseUpdateSelection({
          mode: "selected",
          products: [{ productId: "one", compareDigest: null, salePrice }],
        })
      ).toEqual(expect.objectContaining({ error: expect.any(String) }));
    }

    expect(
      parseUpdateSelection({
        mode: "selected",
        products: [{ productId: "one", compareDigest: null, salePrice: "15.00" }],
      })
    ).toEqual(
      expect.objectContaining({
        selection: expect.objectContaining({
          products: [expect.objectContaining({ salePrice: "15.00" })],
        }),
      })
    );
  });
});
