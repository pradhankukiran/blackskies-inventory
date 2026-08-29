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
  it('parses European prices and calculates a two-decimal 20% discount', () => {
    expect(parseRegularPrice('€ 1.234,56')).toBe(1234.56);
    expect(calculateSalePrice(33.99)).toBe('27.19');
    expect(calculateSalePrice(12.57)).toBe('15.00');
  });

  it('matches SKU first and falls back to EAN', () => {
    const result = prepareSalePriceUpdate(
      [
        {
          rowNumber: 9,
          statusDetail: 'ZABLO_01',
          sku: 'ak-r-pur-03-11',
          ean: '4251812338836',
          regularPrice: '33,99',
        },
        {
          statusDetail: 'ZABLO_01',
          ean: '9999999999999',
          regularPrice: 20,
        },
      ],
      variants
    );

    expect(result.rows[0]).toMatchObject({
      rowNumber: 9,
      status: 'ready',
      salePrice: '27.19',
      matchingMethod: 'sku_and_ean',
      shopifyProduct: { id: 'gid://shopify/Product/1' },
    });
    expect(result.rows[1]).toMatchObject({
      status: 'ready',
      salePrice: '16.00',
      matchingMethod: 'ean',
    });
  });

  it('accepts combined ZABLO_01 statuses and skips rows without that status', () => {
    const result = prepareSalePriceUpdate(
      [
        {
          statusDetail: 'ZABLO_02',
          sku: 'AK-R-PUR-03-11',
          regularPrice: 33.99,
        },
        {
          statusDetail: 'ZABLO_15, ZABLO_01, ZANOS_01',
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

  it('marks rows where the €15.00 minimum was applied', () => {
    const result = prepareSalePriceUpdate(
      [{ statusDetail: 'ZABLO_01', sku: 'AK-R-PUR-03-11', regularPrice: 12.57 }],
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
        { statusDetail: 'ZABLO_01', sku: 'AK-R-PUR-03-11', regularPrice: 20 },
        { statusDetail: 'ZABLO_01', sku: 'AK-R-PUR-03-12', regularPrice: 30 },
      ],
      variants
    );

    expect(result.rows.map((row) => row.status)).toEqual(['ready', 'ready']);
    expect(result.products).toEqual([
      expect.objectContaining({
        productId: 'gid://shopify/Product/1',
        status: 'ready',
        salePrice: '24.00',
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
          salePriceMetafield: { value: '27.190', compareDigest: 'digest-current' },
        },
      },
    ];
    const result = prepareSalePriceUpdate(
      [{ statusDetail: 'ZABLO_01', sku: 'AK-R-PUR-03-11', regularPrice: 33.99 }],
      currentVariants
    );

    expect(result.rows[0]).toMatchObject({
      status: 'already_up_to_date',
      currentSalePrice: '27.190',
    });
    expect(result.products[0]).toMatchObject({
      status: 'already_up_to_date',
      currentSalePrice: '27.190',
      salePrice: '27.19',
    });
    expect(result.summary).toMatchObject({
      readyProducts: 0,
      alreadyUpToDateRows: 1,
      alreadyUpToDateProducts: 1,
    });
  });

  it('changes prepared rows and products only after a reported update outcome', () => {
    const result = prepareSalePriceUpdate(
      [{ statusDetail: 'ZABLO_01', sku: 'AK-R-PUR-03-11', regularPrice: 33.99 }],
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
      [{ statusDetail: 'ZABLO_01', sku: 'AK-R-PUR-03-11', regularPrice: 33.99 }],
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
