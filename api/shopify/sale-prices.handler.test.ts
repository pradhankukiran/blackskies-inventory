import { describe, expect, it } from "vitest";
import handler from "./sale-prices";

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
  });

  it("rejects empty row lists before contacting Shopify", async () => {
    const res = response();
    await handler(
      { method: "POST", headers: {}, body: { action: "update", rows: [] } },
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toBe("invalid_rows");
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
        body: { action: "update", rows: validRows },
      },
      res
    );

    expect(res.statusCode).toBe(403);
    expect(res.body?.error).toBe("invalid_origin");
  });
});
