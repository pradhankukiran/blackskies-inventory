import { beforeEach, describe, expect, it, vi } from "vitest";

const { getShopifyClientMock } = vi.hoisted(() => ({
  getShopifyClientMock: vi.fn(),
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
    statusDetail: "ZABLO_01",
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

  it("rejects empty row lists before contacting Shopify", async () => {
    const res = response();
    await handler(
      { method: "POST", headers: {}, body: { action: "update", rows: [] } },
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
        body: { action: "update", selection: { mode: "all" }, rows: validRows },
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
      { method: "POST", headers: {}, body: { action: "update", rows: validRows } },
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
          selection: {
            mode: "selected",
            productId: secondProductId,
            compareDigest: null,
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
          selection: {
            mode: "selected",
            productId: firstProductId,
            compareDigest: "digest-from-preview",
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

  it("does not offer or write a parent whose metafield is already current", async () => {
    const gql = configureShopify([
      variant(
        "gid://shopify/ProductVariant/1",
        firstProductId,
        validRows[0].sku,
        validRows[0].ean,
        "27.190"
      ),
    ]);
    const res = response();

    await handler(
      {
        method: "POST",
        headers: {},
        body: { action: "preview", rows: validRows },
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
        currentSalePrice: "27.190",
      }),
    ]);
    expect(gql.mock.calls.some(([query]) => query.includes("metafieldsSet"))).toBe(false);
  });

  it("updates only selected ready products and leaves the other ready products unchanged", async () => {
    const rows = [
      validRows[0],
      {
        rowNumber: 2,
        statusDetail: "ZABLO_01",
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
          selection: {
            mode: "selected",
            productId: secondProductId,
            compareDigest: null,
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
        value: "39.99",
        compareDigest: null,
      }),
    ]);
    expect(products).toEqual([
      expect.objectContaining({ productId: firstProductId, status: "ready" }),
      expect.objectContaining({ productId: secondProductId, status: "updated" }),
    ]);
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
          selection: {
            mode: "selected",
            productId: firstProductId,
            compareDigest: "digest-before-update",
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
  it("accepts one parent approval and normalizes its ID", () => {
    expect(
      parseUpdateSelection({
        mode: "selected",
        productId: " gid://shopify/Product/1 ",
        compareDigest: "digest-preview",
      })
    ).toEqual({
      selection: {
        mode: "selected",
        productId: "gid://shopify/Product/1",
        compareDigest: "digest-preview",
      },
    });
  });

  it("rejects bulk mode, missing products, and missing preview digests", () => {
    expect(parseUpdateSelection({ mode: "all" })).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
    expect(parseUpdateSelection({ mode: "selected", productId: "" })).toEqual(
      expect.objectContaining({ error: expect.any(String) })
    );
    expect(
      parseUpdateSelection({ mode: "selected", productId: "one" })
    ).toEqual(expect.objectContaining({ error: expect.any(String) }));
  });
});
