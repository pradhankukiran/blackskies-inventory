import { afterEach, describe, expect, it } from "vitest";
import handler from "./sale-prices";

const originalUpdateSecret = process.env.SHOPIFY_SALE_PRICE_UPDATE_SECRET;

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

afterEach(() => {
  if (originalUpdateSecret === undefined) {
    delete process.env.SHOPIFY_SALE_PRICE_UPDATE_SECRET;
  } else {
    process.env.SHOPIFY_SALE_PRICE_UPDATE_SECRET = originalUpdateSecret;
  }
});

describe("Shopify sale-price endpoint safeguards", () => {
  it("accepts POST only", async () => {
    const res = response();
    await handler({ method: "GET", headers: {} }, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe("POST");
  });

  it("fails closed when the update secret is not configured", async () => {
    delete process.env.SHOPIFY_SALE_PRICE_UPDATE_SECRET;
    const res = response();
    await handler(
      { method: "POST", headers: {}, body: { action: "update", rows: validRows } },
      res
    );

    expect(res.statusCode).toBe(503);
    expect(res.body?.error).toBe("update_not_configured");
  });

  it("rejects an incorrect update secret", async () => {
    process.env.SHOPIFY_SALE_PRICE_UPDATE_SECRET = "correct-secret";
    const res = response();
    await handler(
      {
        method: "POST",
        headers: { "x-sale-price-update-secret": "wrong-secret" },
        body: { action: "update", rows: validRows },
      },
      res
    );

    expect(res.statusCode).toBe(401);
    expect(res.body?.error).toBe("invalid_update_secret");
  });

  it("rejects cross-origin updates before contacting Shopify", async () => {
    process.env.SHOPIFY_SALE_PRICE_UPDATE_SECRET = "correct-secret";
    const res = response();
    await handler(
      {
        method: "POST",
        headers: {
          host: "inventory.example.com",
          origin: "https://attacker.example.com",
          "x-sale-price-update-secret": "correct-secret",
        },
        body: { action: "update", rows: validRows },
      },
      res
    );

    expect(res.statusCode).toBe(403);
    expect(res.body?.error).toBe("invalid_origin");
  });
});
