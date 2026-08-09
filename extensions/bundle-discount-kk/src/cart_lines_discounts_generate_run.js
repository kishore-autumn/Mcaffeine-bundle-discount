import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from '../generated/api';

/**
 * @typedef {import("../generated/api").CartInput} RunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 */

/**
 * @param {RunInput} input
 * @returns {CartLinesDiscountsGenerateRunResult}
 */

export function cartLinesDiscountsGenerateRun(input) {
  if (!input.cart.lines.length) {
    return { operations: [] };
  }

  const hasProductDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Product,
  );

  if (!hasProductDiscountClass) {
    return { operations: [] };
  }

  // Parse configuration from metafield
  let configuration;
  try {
    configuration = JSON.parse(
      input?.discount?.metafield?.value ?? '{}'
    );
  } catch (e) {
    console.error('Invalid metafield JSON:', e);
    return { operations: [] };
  }

  const { quantity: bundleQty, fixedPrice } = configuration;

  // Validate config
  if (!bundleQty || !fixedPrice || bundleQty <= 0 || fixedPrice <= 0) {
    return { operations: [] };
  }

  // Separate eligible lines — exclude products with "exclude_bundle_discount" tag
  const eligibleLines = input.cart.lines.filter((line) => {
    const hasTags = line.merchandise?.product?.hasTags ?? [];
    const excludeTag = hasTags.find(
      (t) => t.tag === 'exclude_bundle_discount'
    );
    return !excludeTag?.hasTag;
  });

  if (!eligibleLines.length) {
    return { operations: [] };
  }

  // Flatten eligible lines into individual units with price + lineId
  let individualItems = [];
  for (const line of eligibleLines) {
    const price = parseFloat(line.cost.amountPerQuantity.amount);
    for (let i = 0; i < line.quantity; i++) {
      individualItems.push({ lineId: line.id, price });
    }
  }

  const totalEligibleQty = individualItems.length;

  if (totalEligibleQty < bundleQty) {
    return { operations: [] };
  }

  // Sort ascending — cheapest items are included in the bundle
  individualItems.sort((a, b) => a.price - b.price);

  // Number of complete bundles
  const bundleCount = Math.floor(totalEligibleQty / bundleQty);
  const bundleItemCount = bundleCount * bundleQty;

  // Only the cheapest bundleItemCount items get discounted
  const bundleItems = individualItems.slice(0, bundleItemCount);

  // Actual total of bundle items at full price
  const bundleItemsTotal = bundleItems.reduce(
    (sum, item) => sum + item.price,
    0
  );

  // Target price for all bundles combined
  const targetBundleTotal = bundleCount * fixedPrice;

  // Total discount to apply
  const totalDiscount = bundleItemsTotal - targetBundleTotal;

  if (totalDiscount <= 0) {
    return { operations: [] };
  }

  // ── Key Fix: Calculate discount per line based ONLY on bundle items ──
  // Group bundle items by lineId and sum their prices
  const bundleDiscountByLine = {};
  for (const item of bundleItems) {
    if (!bundleDiscountByLine[item.lineId]) {
      bundleDiscountByLine[item.lineId] = 0;
    }
    bundleDiscountByLine[item.lineId] += item.price;
  }

  // Total of bundle items (for proportional split)
  const bundleTotal = bundleItems.reduce((sum, item) => sum + item.price, 0);

  // Build candidates — only for lines that have bundle items
  const candidates = [];
  for (const line of eligibleLines) {
    const lineBundleTotal = bundleDiscountByLine[line.id];
    if (!lineBundleTotal) continue; // This line has no bundle items (remainder)

    // Proportional discount for this line based on its share of bundle total
    const lineDiscountShare = (lineBundleTotal / bundleTotal) * totalDiscount;

    if (lineDiscountShare > 0) {
      candidates.push({
        message: `BUY${bundleQty}@${fixedPrice} Bundle Offer`,
        targets: [
          {
            cartLine: {
              id: line.id,
            },
          },
        ],
        value: {
          fixedAmount: {
            amount: lineDiscountShare.toFixed(2),
          },
        },
      });
    }
  }

  if (!candidates.length) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}