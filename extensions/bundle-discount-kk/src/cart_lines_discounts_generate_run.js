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

  const bundleQty = parseInt(configuration.quantity, 10);
  const fixedPrice = parseFloat(configuration.fixedPrice);

  // Validate config
  if (!bundleQty || isNaN(bundleQty) || bundleQty <= 0 || !fixedPrice || isNaN(fixedPrice) || fixedPrice <= 0) {
    return { operations: [] };
  }

  const appliesTo = configuration.appliesTo ?? 'all';
  const hasIncludedCollections =
    appliesTo === 'collections' &&
    Array.isArray(configuration.includedCollectionIds) &&
    configuration.includedCollectionIds.length > 0;

  const hasExcludedCollections =
    Array.isArray(configuration.excludedCollectionIds) &&
    configuration.excludedCollectionIds.length > 0;

  // Helper to normalize collection GIDs and numeric IDs for flexible matching
  const normalizeId = (id) =>
    String(id || '').replace(/^gid:\/\/shopify\/Collection\//, '').trim();

  const excludedIds = new Set(
    (configuration.excludedCollectionIds || []).map(normalizeId).filter(Boolean)
  );

  const excludedHandles = new Set(
    (configuration.excludedCollections || [])
      .map((c) => (c.handle || c.title || '').toLowerCase().trim())
      .filter(Boolean)
  );

  const includedIds = new Set(
    (configuration.includedCollectionIds || []).map(normalizeId).filter(Boolean)
  );

  const includedHandles = new Set(
    (configuration.includedCollections || [])
      .map((c) => (c.handle || c.title || '').toLowerCase().trim())
      .filter(Boolean)
  );

  // Filter eligible lines based on tags, source collection attributes, excluded & included collections
  const eligibleLines = input.cart.lines.filter((line) => {
    const product = line.merchandise?.product;
    if (!product) return false;

    // 1. Exclude products with "exclude_bundle_discount" tag
    const hasTags = product.hasTags ?? [];
    const hasExcludeTag = hasTags.some(
      (t) => t.tag === 'exclude_bundle_discount' && t.hasTag
    );
    if (hasExcludeTag) return false;

    // 2. Minimal Exclude Flag from Schema / Theme (_exclude_bundle: "true")
    // or source matching an excluded collection
    const rawSourceId = line.sourceCollectionId?.value;
    const rawSourceHandle = line.sourceCollectionHandle?.value;

    const sourceId = normalizeId(rawSourceId);
    const sourceHandle = (rawSourceHandle || '').toLowerCase().trim();

    const isExplicitlyExcluded =
      line.excludeBundle?.value === 'true' ||
      line.sourceCollectionHandle?.value === 'excluded' ||
      (sourceId && excludedIds.has(sourceId)) ||
      (sourceHandle && excludedHandles.has(sourceHandle));

    if (isExplicitlyExcluded) {
      return false;
    }

    // Check if line was explicitly added from an included collection/source
    const isSourcedFromIncluded =
      (sourceId && includedIds.has(sourceId)) ||
      (sourceHandle && includedHandles.has(sourceHandle));

    // 3. Catalog-based Excluded Collections Check:
    // If discount applies to ALL products, catalog excluded items are excluded.
    // If discount applies to specific collections, catalog exclusion applies if the item
    // is not in an included collection (or if explicitly added from an excluded source).
    if (hasExcludedCollections && product.inExcludedCollection) {
      if (appliesTo === 'all') {
        return false;
      }
      if (!product.inIncludedCollection && !isSourcedFromIncluded) {
        return false;
      }
    }

    // 4. Included Collections Check (when discount applies to specific collections)
    // Products in the included collection naturally receive discount from any page (HP, PLP, PDP)
    if (hasIncludedCollections) {
      const isIncluded = isSourcedFromIncluded || product.inIncludedCollection;
      if (!isIncluded) {
        return false;
      }
    }

    return true;
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

  // ── Key Fix: Group bundle items by lineId, tracking unit count & total price ──
  const bundleByLine = {};
  for (const item of bundleItems) {
    if (!bundleByLine[item.lineId]) {
      bundleByLine[item.lineId] = {
        count: 0,
        total: 0,
      };
    }
    bundleByLine[item.lineId].count += 1;
    bundleByLine[item.lineId].total += item.price;
  }

  const eligibleLinesWithBundle = eligibleLines.filter(
    (line) => bundleByLine[line.id]?.count > 0
  );

  // Build candidates — target ONLY lines that have bundle items, with exact unit quantity
  const candidates = [];
  let allocatedDiscount = 0;

  for (let idx = 0; idx < eligibleLinesWithBundle.length; idx++) {
    const line = eligibleLinesWithBundle[idx];
    const lineBundleInfo = bundleByLine[line.id];
    const isLast = idx === eligibleLinesWithBundle.length - 1;

    let lineDiscountShare;
    if (isLast) {
      // Allocate remaining discount to avoid penny rounding discrepancies
      lineDiscountShare = Math.round((totalDiscount - allocatedDiscount) * 100) / 100;
    } else {
      lineDiscountShare = Math.round(((lineBundleInfo.total / bundleItemsTotal) * totalDiscount) * 100) / 100;
      allocatedDiscount += lineDiscountShare;
    }

    if (lineDiscountShare > 0) {
      candidates.push({
        message: `BUY${fixedPrice}`,
        targets: [
          {
            cartLine: {
              id: line.id,
              quantity: lineBundleInfo.count, // Targets ONLY the units forming the bundle
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
