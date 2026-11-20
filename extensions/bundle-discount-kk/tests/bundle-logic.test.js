import { describe, test, expect } from 'vitest';
import { cartLinesDiscountsGenerateRun } from '../src/cart_lines_discounts_generate_run.js';

describe('Bundle Discount Function Logic', () => {
  const baseConfig = {
    quantity: 3,
    fixedPrice: 999,
  };

  test('Single cart line with 7 units (BUY 3 @ 999): discounts 6 units, leaves 7th untouched', () => {
    const input = {
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/1',
            quantity: 7,
            cost: {
              amountPerQuantity: { amount: '400.00', currencyCode: 'INR' },
              subtotalAmount: { amount: '2800.00' },
            },
            merchandise: {
              id: 'gid://shopify/ProductVariant/1',
              product: {
                id: 'gid://shopify/Product/1',
                hasTags: [],
              },
            },
          },
        ],
      },
      discount: {
        discountClasses: ['PRODUCT'],
        metafield: {
          value: JSON.stringify(baseConfig),
        },
      },
    };

    const result = cartLinesDiscountsGenerateRun(input);
    expect(result.operations).toHaveLength(1);

    const candidates = result.operations[0].productDiscountsAdd.candidates;
    expect(candidates).toHaveLength(1);

    // KEY VERIFICATION: exactly 6 units targeted, NOT 7!
    expect(candidates[0].targets[0].cartLine.id).toBe('gid://shopify/CartLine/1');
    expect(candidates[0].targets[0].cartLine.quantity).toBe(6);

    // 6 * 400 = 2400. Target for 2 bundles = 2 * 999 = 1998. Total discount = 402.00
    expect(candidates[0].value.fixedAmount.amount).toBe('402.00');
  });

  test('Multiple cart lines: Line 1 (qty 3), Line 2 (qty 4) totaling 7 items', () => {
    const input = {
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/1',
            quantity: 3,
            cost: {
              amountPerQuantity: { amount: '400.00', currencyCode: 'INR' },
              subtotalAmount: { amount: '1200.00' },
            },
            merchandise: {
              id: 'gid://shopify/ProductVariant/1',
              product: {
                id: 'gid://shopify/Product/1',
                hasTags: [],
              },
            },
          },
          {
            id: 'gid://shopify/CartLine/2',
            quantity: 4,
            cost: {
              amountPerQuantity: { amount: '400.00', currencyCode: 'INR' },
              subtotalAmount: { amount: '1600.00' },
            },
            merchandise: {
              id: 'gid://shopify/ProductVariant/2',
              product: {
                id: 'gid://shopify/Product/2',
                hasTags: [],
              },
            },
          },
        ],
      },
      discount: {
        discountClasses: ['PRODUCT'],
        metafield: {
          value: JSON.stringify(baseConfig),
        },
      },
    };

    const result = cartLinesDiscountsGenerateRun(input);
    expect(result.operations).toHaveLength(1);

    const candidates = result.operations[0].productDiscountsAdd.candidates;
    expect(candidates).toHaveLength(2);

    // Line 1: all 3 units in bundle
    expect(candidates[0].targets[0].cartLine.id).toBe('gid://shopify/CartLine/1');
    expect(candidates[0].targets[0].cartLine.quantity).toBe(3);
    expect(candidates[0].value.fixedAmount.amount).toBe('201.00');

    // Line 2: only 3 of 4 units in bundle! The 4th unit is untouched.
    expect(candidates[1].targets[0].cartLine.id).toBe('gid://shopify/CartLine/2');
    expect(candidates[1].targets[0].cartLine.quantity).toBe(3);
    expect(candidates[1].value.fixedAmount.amount).toBe('201.00');

    // Total discount = 201 + 201 = 402.00
  });

  test('8 items in cart: 2 complete bundles (6 items) + 2 normal items untouched', () => {
    const input = {
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/1',
            quantity: 8,
            cost: {
              amountPerQuantity: { amount: '450.00', currencyCode: 'INR' },
              subtotalAmount: { amount: '3600.00' },
            },
            merchandise: {
              id: 'gid://shopify/ProductVariant/1',
              product: {
                id: 'gid://shopify/Product/1',
                hasTags: [],
              },
            },
          },
        ],
      },
      discount: {
        discountClasses: ['PRODUCT'],
        metafield: {
          value: JSON.stringify(baseConfig),
        },
      },
    };

    const result = cartLinesDiscountsGenerateRun(input);
    const candidates = result.operations[0].productDiscountsAdd.candidates;
    expect(candidates).toHaveLength(1);
    // Exactly 6 units targeted
    expect(candidates[0].targets[0].cartLine.quantity).toBe(6);
    // 6 * 450 = 2700 - 1998 = 702.00
    expect(candidates[0].value.fixedAmount.amount).toBe('702.00');
  });

  test('Different prices: proportional split across lines with pennies rounding preservation', () => {
    const input = {
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/1',
            quantity: 1,
            cost: { amountPerQuantity: { amount: '350.00', currencyCode: 'INR' }, subtotalAmount: { amount: '350.00' } },
            merchandise: { id: 'gid://shopify/ProductVariant/1', product: { id: 'gid://shopify/Product/1' } },
          },
          {
            id: 'gid://shopify/CartLine/2',
            quantity: 1,
            cost: { amountPerQuantity: { amount: '450.00', currencyCode: 'INR' }, subtotalAmount: { amount: '450.00' } },
            merchandise: { id: 'gid://shopify/ProductVariant/2', product: { id: 'gid://shopify/Product/2' } },
          },
          {
            id: 'gid://shopify/CartLine/3',
            quantity: 1,
            cost: { amountPerQuantity: { amount: '550.00', currencyCode: 'INR' }, subtotalAmount: { amount: '550.00' } },
            merchandise: { id: 'gid://shopify/ProductVariant/3', product: { id: 'gid://shopify/Product/3' } },
          },
        ],
      },
      discount: {
        discountClasses: ['PRODUCT'],
        metafield: {
          value: JSON.stringify(baseConfig),
        },
      },
    };

    const result = cartLinesDiscountsGenerateRun(input);
    const candidates = result.operations[0].productDiscountsAdd.candidates;
    expect(candidates).toHaveLength(3);

    // Total = 350 + 450 + 550 = 1350. Target = 999. Discount = 351.00.
    const sumDiscounts = candidates.reduce((sum, c) => sum + parseFloat(c.value.fixedAmount.amount), 0);
    expect(sumDiscounts.toFixed(2)).toBe('351.00');
    candidates.forEach((c) => {
      expect(c.targets[0].cartLine.quantity).toBe(1);
    });
  });

  test('Automatic discount: Excluded collection product is completely bypassed', () => {
    const input = {
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/1',
            quantity: 3,
            cost: {
              amountPerQuantity: { amount: '400.00', currencyCode: 'INR' },
              subtotalAmount: { amount: '1200.00' },
            },
            merchandise: {
              id: 'gid://shopify/ProductVariant/1',
              product: {
                id: 'gid://shopify/Product/1',
                inExcludedCollection: false,
                hasTags: [],
              },
            },
          },
          {
            id: 'gid://shopify/CartLine/2',
            quantity: 1,
            cost: {
              amountPerQuantity: { amount: '500.00', currencyCode: 'INR' },
              subtotalAmount: { amount: '500.00' },
            },
            merchandise: {
              id: 'gid://shopify/ProductVariant/2',
              product: {
                id: 'gid://shopify/Product/2',
                inExcludedCollection: true, // EXCLUDED
                hasTags: [],
              },
            },
          },
        ],
      },
      discount: {
        discountClasses: ['PRODUCT'],
        metafield: {
          value: JSON.stringify({
            quantity: 3,
            fixedPrice: 999,
            appliesTo: 'all',
            excludedCollectionIds: ['gid://shopify/Collection/Excluded1'],
          }),
        },
      },
    };

    const result = cartLinesDiscountsGenerateRun(input);
    expect(result.operations).toHaveLength(1);

    const candidates = result.operations[0].productDiscountsAdd.candidates;
    // Only Line 1 gets the candidate
    expect(candidates).toHaveLength(1);
    expect(candidates[0].targets[0].cartLine.id).toBe('gid://shopify/CartLine/1');
    expect(candidates[0].targets[0].cartLine.quantity).toBe(3);
    // 3 * 400 = 1200 - 999 = 201.00
    expect(candidates[0].value.fixedAmount.amount).toBe('201.00');
  });

  test('Manual/Code discount: Only products in Included collection are eligible', () => {
    const input = {
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/1',
            quantity: 3,
            cost: {
              amountPerQuantity: { amount: '400.00', currencyCode: 'INR' },
              subtotalAmount: { amount: '1200.00' },
            },
            merchandise: {
              id: 'gid://shopify/ProductVariant/1',
              product: {
                id: 'gid://shopify/Product/1',
                inIncludedCollection: true, // INCLUDED
                hasTags: [],
              },
            },
          },
          {
            id: 'gid://shopify/CartLine/2',
            quantity: 3,
            cost: {
              amountPerQuantity: { amount: '400.00', currencyCode: 'INR' },
              subtotalAmount: { amount: '1200.00' },
            },
            merchandise: {
              id: 'gid://shopify/ProductVariant/2',
              product: {
                id: 'gid://shopify/Product/2',
                inIncludedCollection: false, // NOT INCLUDED
                hasTags: [],
              },
            },
          },
        ],
      },
      discount: {
        discountClasses: ['PRODUCT'],
        metafield: {
          value: JSON.stringify({
            quantity: 3,
            fixedPrice: 999,
            appliesTo: 'collections',
            includedCollectionIds: ['gid://shopify/Collection/PromoCol1'],
          }),
        },
      },
    };

    const result = cartLinesDiscountsGenerateRun(input);
    expect(result.operations).toHaveLength(1);

    const candidates = result.operations[0].productDiscountsAdd.candidates;
    // Only Line 1 (in included collection) is eligible!
    expect(candidates).toHaveLength(1);
    expect(candidates[0].targets[0].cartLine.id).toBe('gid://shopify/CartLine/1');
    expect(candidates[0].targets[0].cartLine.quantity).toBe(3);
  });

  test('Conflict handling: Excluded collection overrides Included collection when _exclude_bundle is set', () => {
    const input = {
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/1',
            quantity: 3,
            excludeBundle: { value: 'true' },
            cost: {
              amountPerQuantity: { amount: '400.00', currencyCode: 'INR' },
              subtotalAmount: { amount: '1200.00' },
            },
            merchandise: {
              id: 'gid://shopify/ProductVariant/1',
              product: {
                id: 'gid://shopify/Product/1',
                inIncludedCollection: true,
                inExcludedCollection: true, // Marked in both collections
                hasTags: [],
              },
            },
          },
        ],
      },
      discount: {
        discountClasses: ['PRODUCT'],
        metafield: {
          value: JSON.stringify({
            quantity: 3,
            fixedPrice: 999,
            appliesTo: 'collections',
            includedCollectionIds: ['gid://shopify/Collection/Col1'],
            excludedCollectionIds: ['gid://shopify/Collection/Col2'],
          }),
        },
      },
    };

    const result = cartLinesDiscountsGenerateRun(input);
    expect(result.operations).toEqual([]);
  });

  test('Normal items without _exclude_bundle get discount from any page (PDP, HP, PLP)', () => {
    const input = {
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/1',
            quantity: 3,
            // NO custom line properties attached - completely clean!
            cost: {
              amountPerQuantity: { amount: '400.00', currencyCode: 'INR' },
              subtotalAmount: { amount: '1200.00' },
            },
            merchandise: {
              id: 'gid://shopify/ProductVariant/1',
              product: {
                id: 'gid://shopify/Product/1',
                inIncludedCollection: true,
                inExcludedCollection: false,
                hasTags: [],
              },
            },
          },
        ],
      },
      discount: {
        discountClasses: ['PRODUCT'],
        metafield: {
          value: JSON.stringify({
            quantity: 3,
            fixedPrice: 999,
            appliesTo: 'collections',
            includedCollectionIds: ['gid://shopify/Collection/Col1'],
          }),
        },
      },
    };

    const result = cartLinesDiscountsGenerateRun(input);
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].productDiscountsAdd.candidates[0].targets[0].cartLine.id).toBe('gid://shopify/CartLine/1');
  });

  test('Tag-based exclusion: exclude_bundle_discount product is bypassed', () => {
    const input = {
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/1',
            quantity: 2,
            cost: {
              amountPerQuantity: { amount: '400.00', currencyCode: 'INR' },
              subtotalAmount: { amount: '800.00' },
            },
            merchandise: {
              id: 'gid://shopify/ProductVariant/1',
              product: {
                id: 'gid://shopify/Product/1',
                hasTags: [{ tag: 'exclude_bundle_discount', hasTag: true }],
              },
            },
          },
          {
            id: 'gid://shopify/CartLine/2',
            quantity: 2,
            cost: {
              amountPerQuantity: { amount: '400.00', currencyCode: 'INR' },
              subtotalAmount: { amount: '800.00' },
            },
            merchandise: {
              id: 'gid://shopify/ProductVariant/2',
              product: {
                id: 'gid://shopify/Product/2',
                hasTags: [],
              },
            },
          },
        ],
      },
      discount: {
        discountClasses: ['PRODUCT'],
        metafield: {
          value: JSON.stringify(baseConfig),
        },
      },
    };

    // Only 2 eligible units (Line 2), bundle requires 3
    const result = cartLinesDiscountsGenerateRun(input);
    expect(result.operations).toEqual([]);
  });

  test('Returns empty operations when cart lines is empty', () => {
    const result = cartLinesDiscountsGenerateRun({
      cart: { lines: [] },
      discount: {
        discountClasses: ['PRODUCT'],
        metafield: { value: JSON.stringify(baseConfig) },
      },
    });
    expect(result.operations).toEqual([]);
  });

  test('Returns empty operations when fixedPrice >= bundle items total (no discount)', () => {
    const input = {
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/1',
            quantity: 3,
            cost: {
              amountPerQuantity: { amount: '200.00', currencyCode: 'INR' },
              subtotalAmount: { amount: '600.00' },
            },
            merchandise: {
              id: 'gid://shopify/ProductVariant/1',
              product: { id: 'gid://shopify/Product/1', hasTags: [] },
            },
          },
        ],
      },
      discount: {
        discountClasses: ['PRODUCT'],
        metafield: {
          // 3 items @ 200 = 600. Fixed price is 999. Discount would be negative.
          value: JSON.stringify(baseConfig),
        },
      },
    };

    const result = cartLinesDiscountsGenerateRun(input);
    expect(result.operations).toEqual([]);
  });

  test('User Scenario: Coffee Body Scrub in both Special Offer (included) and Flipkart (excluded)', () => {
    // Config: Included = Special Offer (id 101, handle: special-offers), Excluded = Flipkart (id 202, handle: flipkart)
    const dualConfig = {
      quantity: 3,
      fixedPrice: 999,
      appliesTo: 'collections',
      includedCollectionIds: ['gid://shopify/Collection/101'],
      includedCollections: [{ id: 'gid://shopify/Collection/101', title: 'Special Offers', handle: 'special-offers' }],
      excludedCollectionIds: ['gid://shopify/Collection/202'],
      excludedCollections: [{ id: 'gid://shopify/Collection/202', title: 'Flipkart Campaign', handle: 'flipkart' }],
    };

    // Subtest A: Added from Flipkart collection page -> carries _source_collection_id = 202 -> MUST BE EXCLUDED
    const cartFromFlipkart = {
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/flipkart-line',
            quantity: 3,
            cost: {
              amountPerQuantity: { amount: '400.00', currencyCode: 'INR' },
              subtotalAmount: { amount: '1200.00' },
            },
            sourceCollectionId: { value: 'gid://shopify/Collection/202' },
            sourceCollectionHandle: { value: 'flipkart' },
            merchandise: {
              id: 'gid://shopify/ProductVariant/coffee-scrub',
              product: {
                id: 'gid://shopify/Product/coffee-scrub',
                inIncludedCollection: true,
                inExcludedCollection: true,
                hasTags: [],
              },
            },
          },
        ],
      },
      discount: {
        discountClasses: ['PRODUCT'],
        metafield: { value: JSON.stringify(dualConfig) },
      },
    };

    const resultFlipkart = cartLinesDiscountsGenerateRun(cartFromFlipkart);
    expect(resultFlipkart.operations).toEqual([]); // EXCLUDED!

    // Subtest B: Added from Special Offers collection page -> carries _source_collection_id = 101 -> MUST BE ELIGIBLE
    const cartFromSpecialOffers = {
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/special-offer-line',
            quantity: 3,
            cost: {
              amountPerQuantity: { amount: '400.00', currencyCode: 'INR' },
              subtotalAmount: { amount: '1200.00' },
            },
            sourceCollectionId: { value: 'gid://shopify/Collection/101' },
            sourceCollectionHandle: { value: 'special-offers' },
            merchandise: {
              id: 'gid://shopify/ProductVariant/coffee-scrub',
              product: {
                id: 'gid://shopify/Product/coffee-scrub',
                inIncludedCollection: true,
                inExcludedCollection: true,
                hasTags: [],
              },
            },
          },
        ],
      },
      discount: {
        discountClasses: ['PRODUCT'],
        metafield: { value: JSON.stringify(dualConfig) },
      },
    };

    const resultSpecialOffers = cartLinesDiscountsGenerateRun(cartFromSpecialOffers);
    expect(resultSpecialOffers.operations).toHaveLength(1);
    expect(resultSpecialOffers.operations[0].productDiscountsAdd.candidates).toHaveLength(1);
    expect(resultSpecialOffers.operations[0].productDiscountsAdd.candidates[0].targets[0].cartLine.id).toBe('gid://shopify/CartLine/special-offer-line');
    expect(resultSpecialOffers.operations[0].productDiscountsAdd.candidates[0].value.fixedAmount.amount).toBe('201.00');
  });

  test('Dynamic matching by numeric ID and handle without GID prefix', () => {
    const config = {
      quantity: 3,
      fixedPrice: 999,
      appliesTo: 'all',
      excludedCollectionIds: ['gid://shopify/Collection/8888'],
      excludedCollections: [{ id: 'gid://shopify/Collection/8888', title: 'GPay Campaign', handle: 'gpay6' }],
    };

    // Passing numeric ID '8888' instead of full GID
    const inputNumericId = {
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/1',
            quantity: 3,
            cost: {
              amountPerQuantity: { amount: '400.00', currencyCode: 'INR' },
              subtotalAmount: { amount: '1200.00' },
            },
            sourceCollectionId: { value: '8888' },
            merchandise: {
              id: 'gid://shopify/ProductVariant/1',
              product: { id: 'gid://shopify/Product/1', hasTags: [] },
            },
          },
        ],
      },
      discount: {
        discountClasses: ['PRODUCT'],
        metafield: { value: JSON.stringify(config) },
      },
    };

    expect(cartLinesDiscountsGenerateRun(inputNumericId).operations).toEqual([]);

    // Passing handle 'gpay6' via _source
    const inputHandle = {
      cart: {
        lines: [
          {
            id: 'gid://shopify/CartLine/1',
            quantity: 3,
            cost: {
              amountPerQuantity: { amount: '400.00', currencyCode: 'INR' },
              subtotalAmount: { amount: '1200.00' },
            },
            sourceCollectionHandle: { value: 'gpay6' },
            merchandise: {
              id: 'gid://shopify/ProductVariant/1',
              product: { id: 'gid://shopify/Product/1', hasTags: [] },
            },
          },
        ],
      },
      discount: {
        discountClasses: ['PRODUCT'],
        metafield: { value: JSON.stringify(config) },
      },
    };

    expect(cartLinesDiscountsGenerateRun(inputHandle).operations).toEqual([]);
  });
});
