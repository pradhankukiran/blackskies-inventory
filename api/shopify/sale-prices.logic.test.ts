import { describe, expect, it } from 'vitest';

import {
  applyProductUpdateResults,
  calculateSalePrice,
  parseRegularPrice,
  prepareSalePriceUpdate,
  type ShopifySalePriceVariant,
} from './sale-prices.logic';

const variants: ShopifySalePriceVariant[] = [
  {
    id: 'gid://shopify/ProductVariant/1',
    sku: 'AK-R-PUR-03-11',
    barcode: '4251812338836',
    product: { id: 'gid://shopify/Product/1', title: 'Purple article' },
  },
  {
    id: 'gid://shopify/ProductVariant/2',
    sku: 'AK-R-PUR-03-12',
    barcode: '4251812338837',
    product: { id: 'gid://shopify/Product/1', title: 'Purple article' },
  },
  {
    id: 'gid://shopify/ProductVariant/3',
    sku: 'OTHER-SKU',
    barcode: '9999999999999',
    product: { id: 'gid://shopify/Product/2', title: 'Other article' },
  },
];

describe('sale-price preparation', () => {
  it('parses European prices and applies the default 10% discount', () => {
    expect(parseRegularPrice('€ 1.234,56')).toBe(1234.56);
    expect(calculateSalePrice(33.99)).toBe('30.59');
    expect(calculateSalePrice(12.57)).toBe('15.00');
  });

  it('supports custom discounts, rounds to two decimals, and gives the €15 floor priority', () => {
    expect(calculateSalePrice(33.99, 25)).toBe('25.49');
    expect(calculateSalePrice(18, 25)).toBe('15.00');
    expect(calculateSalePrice(20, 100)).toBe('15.00');

    const result = prepareSalePriceUpdate(
      [
        {
          statusDetail: 'ZABLO_646',
          country: 'de',
          currency: 'EUR',
          sku: 'AK-R-PUR-03-11',
          regularPrice: 33.99,
        },
      ],
      variants,
      25
    );

    expect(result.rows[0]).toMatchObject({ salePrice: '25.49', status: 'ready' });
  });

  it('rejects discounts outside the allowed 10% to 100% range', () => {
    expect(() => calculateSalePrice(33.99, 9)).toThrow(RangeError);
    expect(() => calculateSalePrice(33.99, 101)).toThrow(RangeError);
    expect(() => prepareSalePriceUpdate([], variants, 9)).toThrow(RangeError);
    expect(() => prepareSalePriceUpdate([], variants, 101)).toThrow(RangeError);
  });

  it('matches SKU first and falls back to EAN', () => {
    const result = prepareSalePriceUpdate(
      [
        {
          rowNumber: 9,
          statusDetail: 'ZABLO_646',
          country: 'de',
          currency: 'EUR',
          sku: 'ak-r-pur-03-11',
          ean: '4251812338836',
          regularPrice: '33,99',
        },
        {
          statusDetail: 'ZABLO_646',
          country: 'de',
          currency: 'EUR',
          ean: '9999999999999',
          regularPrice: 20,
        },
      ],
      variants
    );

    expect(result.rows[0]).toMatchObject({
      rowNumber: 9,
      status: 'ready',
      salePrice: '30.59',
      matchingMethod: 'sku_and_ean',
      shopifyProduct: { id: 'gid://shopify/Product/1' },
    });
    expect(result.rows[1]).toMatchObject({
      status: 'ready',
      salePrice: '18.00',
      matchingMethod: 'ean',
    });
  });

  it('accepts combined ZABLO_646 statuses and skips rows without that status', () => {
    const result = prepareSalePriceUpdate(
      [
        {
          statusDetail: 'ZABLO_02',
          sku: 'AK-R-PUR-03-11',
          regularPrice: 33.99,
        },
        {
          statusDetail: 'ZABLO_15, ZABLO_646, ZANOS_01',
          country: 'de',
          currency: 'EUR',
          sku: 'AK-R-PUR-03-11',
          regularPrice: 33.99,
        },
      ],
      variants
    );

    expect(result.rows.map((row) => row.status)).toEqual([
      'outside_target_status',
      'ready',
    ]);
    expect(result.summary.outsideTargetStatusRows).toBe(1);
  });

  it('accepts only DE market rows with EUR prices', () => {
    const result = prepareSalePriceUpdate(
      [
        {
          statusDetail: 'ZABLO_646',
          country: 'at',
          currency: 'EUR',
          sku: 'AK-R-PUR-03-11',
          regularPrice: 33.99,
        },
        {
          statusDetail: 'ZABLO_646',
          country: 'de',
          currency: 'DKK',
          sku: 'AK-R-PUR-03-12',
          regularPrice: 33.99,
        },
      ],
      variants
    );

    expect(result.rows.map((row) => row.status)).toEqual([
      'outside_target_market',
      'invalid_currency',
    ]);
    expect(result.summary).toMatchObject({
      outsideTargetMarketRows: 1,
      invalidCurrencyRows: 1,
    });
  });

  it('marks rows where the €15.00 minimum was applied', () => {
    const result = prepareSalePriceUpdate(
      [
        {
          statusDetail: 'ZABLO_646',
          country: 'de',
          currency: 'EUR',
          sku: 'AK-R-PUR-03-11',
          regularPrice: 12.57,
        },
      ],
      variants
    );

    expect(result.rows[0]).toMatchObject({
      status: 'ready',
      salePrice: '15.00',
      minimumPriceApplied: true,
      message: expect.stringContaining('€15.00 minimum'),
    });
    expect(result.summary.minimumPriceAppliedRows).toBe(1);
  });

  it('uses the highest calculated sale price for SKUs sharing a parent product', () => {
    const result = prepareSalePriceUpdate(
      [
        {
          statusDetail: 'ZABLO_646',
          country: 'de',
          currency: 'EUR',
          sku: 'AK-R-PUR-03-11',
          regularPrice: 20,
        },
        {
          statusDetail: 'ZABLO_646',
          country: 'de',
          currency: 'EUR',
          sku: 'AK-R-PUR-03-12',
          regularPrice: 30,
        },
      ],
      variants
    );

    expect(result.rows.map((row) => row.status)).toEqual(['ready', 'ready']);
    expect(result.products).toEqual([
      expect.objectContaining({
        productId: 'gid://shopify/Product/1',
        status: 'ready',
        salePrice: '27.00',
        message: expect.stringContaining('highest calculated sale price'),
      }),
    ]);
    expect(result.summary).toMatchObject({ readyProducts: 1, productPriceConflicts: 0 });
  });

  it('excludes a parent whose current Shopify metafield already matches', () => {
    const currentVariants: ShopifySalePriceVariant[] = [
      {
        ...variants[0],
        product: {
          ...variants[0].product,
          salePriceMetafield: { value: '30.590', compareDigest: 'digest-current' },
        },
      },
    ];
    const result = prepareSalePriceUpdate(
      [
        {
          statusDetail: 'ZABLO_646',
          country: 'de',
          currency: 'EUR',
          sku: 'AK-R-PUR-03-11',
          regularPrice: 33.99,
        },
      ],
      currentVariants
    );

    expect(result.rows[0]).toMatchObject({
      status: 'already_up_to_date',
      currentSalePrice: '30.590',
    });
    expect(result.products[0]).toMatchObject({
      status: 'already_up_to_date',
      currentSalePrice: '30.590',
      salePrice: '30.59',
    });
    expect(result.summary).toMatchObject({
      readyProducts: 0,
      alreadyUpToDateRows: 1,
      alreadyUpToDateProducts: 1,
    });
  });

  it('changes prepared rows and products only after a reported update outcome', () => {
    const result = prepareSalePriceUpdate(
      [
        {
          statusDetail: 'ZABLO_646',
          country: 'de',
          currency: 'EUR',
          sku: 'AK-R-PUR-03-11',
          regularPrice: 33.99,
        },
      ],
      variants
    );
    const updated = applyProductUpdateResults(
      result,
      new Map([['gid://shopify/Product/1', { updated: true, message: null }]])
    );

    expect(updated.rows[0].status).toBe('updated');
    expect(updated.products[0].status).toBe('updated');
    expect(updated.summary.readyProducts).toBe(0);
  });

  it('marks a parent for another review when Shopify reports a concurrent change', () => {
    const result = prepareSalePriceUpdate(
      [
        {
          statusDetail: 'ZABLO_646',
          country: 'de',
          currency: 'EUR',
          sku: 'AK-R-PUR-03-11',
          regularPrice: 33.99,
        },
      ],
      variants
    );
    const conflicted = applyProductUpdateResults(
      result,
      new Map([
        [
          'gid://shopify/Product/1',
          {
            updated: false,
            conflict: true,
            message: 'STALE_OBJECT: The metafield changed after it was read.',
          },
        ],
      ])
    );

    expect(conflicted.rows[0].status).toBe('update_conflict');
    expect(conflicted.products[0].status).toBe('update_conflict');
    expect(conflicted.summary.updateConflictProducts).toBe(1);
  });
});
