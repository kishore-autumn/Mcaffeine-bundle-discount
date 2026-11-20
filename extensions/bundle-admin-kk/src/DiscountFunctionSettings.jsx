import { render } from "preact";
import { useState, useEffect, useMemo } from "preact/hooks";

const METAFIELD_NAMESPACE = "$app:bundle-discount--ui-extension";
const METAFIELD_KEY = "function-configuration";

export default async () => {
  const existingDefinition = await getMetafieldDefinition();
  if (!existingDefinition) {
    const metafieldDefinition = await createMetafieldDefinition();
    if (!metafieldDefinition) {
      throw new Error("Failed to create metafield definition");
    }
  }

  render(<App />, document.body);
};

// ─── Metafield Definition Helpers ─────────────────────────────────────────

async function getMetafieldDefinition() {
  const query = `#graphql
    query GetMetafieldDefinition {
      metafieldDefinitions(
        first: 1,
        ownerType: DISCOUNT,
        namespace: "${METAFIELD_NAMESPACE}",
        key: "${METAFIELD_KEY}"
      ) {
        nodes {
          id
        }
      }
    }
  `;

  const result = await shopify.query(query);
  // @ts-ignore
  return result?.data?.metafieldDefinitions?.nodes?.[0];
}

async function createMetafieldDefinition() {
  const definition = {
    access: {
      admin: "MERCHANT_READ_WRITE",
    },
    key: METAFIELD_KEY,
    name: "Bundle Discount Configuration",
    namespace: METAFIELD_NAMESPACE,
    ownerType: "DISCOUNT",
    type: "json",
  };

  const query = `#graphql
    mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition {
          id
        }
      }
    }
  `;

  const result = await shopify.query(query, { variables: { definition } });
  // @ts-ignore
  return result?.data?.metafieldDefinitionCreate?.createdDefinition || null;
}

// ─── Fetch Collections by IDs ──────────────────────────────────────────────

async function getCollections(collectionGids) {
  if (!collectionGids || !collectionGids.length) return [];
  const query = `#graphql
    query GetCollections($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Collection {
          id
          title
          handle
        }
      }
    }
  `;
  try {
    const result = await shopify.query(query, { variables: { ids: collectionGids } });
    // @ts-ignore
    return (result?.data?.nodes ?? []).filter(Boolean);
  } catch (e) {
    console.error("Failed to fetch collections", e);
    return collectionGids.map((id) => ({ id, title: id.split("/").pop(), handle: "" }));
  }
}

// ─── Parse Metafield ───────────────────────────────────────────────────────

function parseMetafield(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return {
      quantity: String(parsed.quantity ?? "3"),
      fixedPrice: String(parsed.fixedPrice ?? "999"),
      appliesTo: parsed.appliesTo ?? (parsed.includedCollectionIds?.length > 0 ? "collections" : "all"),
      includedCollectionIds: Array.isArray(parsed.includedCollectionIds) ? parsed.includedCollectionIds : [],
      excludedCollectionIds: Array.isArray(parsed.excludedCollectionIds) ? parsed.excludedCollectionIds : [],
      includedCollections: Array.isArray(parsed.includedCollections) ? parsed.includedCollections : [],
      excludedCollections: Array.isArray(parsed.excludedCollections) ? parsed.excludedCollections : [],
    };
  } catch {
    return {
      quantity: "3",
      fixedPrice: "999",
      appliesTo: "all",
      includedCollectionIds: [],
      excludedCollectionIds: [],
      includedCollections: [],
      excludedCollections: [],
    };
  }
}

// ─── useExtensionData Hook ─────────────────────────────────────────────────

function useExtensionData() {
  const { applyMetafieldChange, i18n, data, resourcePicker } = shopify;

  const rawMetafieldValue = data?.metafields?.find(
    (metafield) => metafield.key === METAFIELD_KEY
  )?.value;

  const metafieldConfig = useMemo(
    () => parseMetafield(rawMetafieldValue),
    [rawMetafieldValue]
  );

  const [config, setConfig] = useState(metafieldConfig);
  const [initialConfig, setInitialConfig] = useState(metafieldConfig);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function initCollections() {
      const parsed = parseMetafield(rawMetafieldValue);

      let incColls = parsed.includedCollections;
      if (!incColls.length && parsed.includedCollectionIds.length) {
        incColls = await getCollections(parsed.includedCollectionIds);
      }

      let excColls = parsed.excludedCollections;
      if (!excColls.length && parsed.excludedCollectionIds.length) {
        excColls = await getCollections(parsed.excludedCollectionIds);
      }

      const fullConfig = {
        ...parsed,
        includedCollections: incColls,
        excludedCollections: excColls,
      };

      setConfig(fullConfig);
      setInitialConfig(fullConfig);
    }

    initCollections();
  }, [rawMetafieldValue]);

  const onConfigChange = (key, value) => {
    setConfig((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const onSelectIncludedCollections = async () => {
    const selection = await resourcePicker({
      type: "collection",
      action: "select",
      multiple: true,
      selectionIds: config.includedCollections.map((c) => ({ id: c.id })),
    });

    if (selection) {
      const collections = selection.map((c) => ({
        id: c.id,
        title: c.title,
        handle: c.handle || c.title?.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      }));
      setConfig((prev) => ({
        ...prev,
        includedCollections: collections,
        includedCollectionIds: collections.map((c) => c.id),
      }));
    }
  };

  const removeIncludedCollection = (id) => {
    setConfig((prev) => {
      const collections = prev.includedCollections.filter((c) => c.id !== id);
      return {
        ...prev,
        includedCollections: collections,
        includedCollectionIds: collections.map((c) => c.id),
      };
    });
  };

  const onSelectExcludedCollections = async () => {
    const selection = await resourcePicker({
      type: "collection",
      action: "select",
      multiple: true,
      selectionIds: config.excludedCollections.map((c) => ({ id: c.id })),
    });

    if (selection) {
      const collections = selection.map((c) => ({
        id: c.id,
        title: c.title,
        handle: c.handle || c.title?.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      }));
      setConfig((prev) => ({
        ...prev,
        excludedCollections: collections,
        excludedCollectionIds: collections.map((c) => c.id),
      }));
    }
  };

  const removeExcludedCollection = (id) => {
    setConfig((prev) => {
      const collections = prev.excludedCollections.filter((c) => c.id !== id);
      return {
        ...prev,
        excludedCollections: collections,
        excludedCollectionIds: collections.map((c) => c.id),
      };
    });
  };

  async function applyExtensionMetafieldChange() {
    const payload = {
      quantity: parseInt(config.quantity, 10) || 3,
      fixedPrice: parseFloat(config.fixedPrice) || 999,
      appliesTo: config.appliesTo,
      includedCollectionIds:
        config.appliesTo === "collections"
          ? config.includedCollections.map((c) => c.id)
          : [],
      excludedCollectionIds: config.excludedCollections.map((c) => c.id),
      includedCollections:
        config.appliesTo === "collections"
          ? config.includedCollections.map((c) => ({
              id: c.id,
              title: c.title,
              handle: c.handle || "",
            }))
          : [],
      excludedCollections: config.excludedCollections.map((c) => ({
        id: c.id,
        title: c.title,
        handle: c.handle || "",
      })),
    };

    await applyMetafieldChange({
      type: "updateMetafield",
      namespace: METAFIELD_NAMESPACE,
      key: METAFIELD_KEY,
      value: JSON.stringify(payload),
      valueType: "json",
    });
    setInitialConfig(config);
  }

  const resetForm = () => {
    setConfig(initialConfig);
  };

  return {
    applyExtensionMetafieldChange,
    i18n,
    config,
    initialConfig,
    onConfigChange,
    onSelectIncludedCollections,
    removeIncludedCollection,
    onSelectExcludedCollections,
    removeExcludedCollection,
    resetForm,
    loading,
  };
}

// ─── Collection List Card Component ────────────────────────────────────────

function CollectionsCard({ collections, onRemove, emptyText }) {
  if (!collections || collections.length === 0) {
    return emptyText ? (
      <s-box padding="tight none">
        <s-text tone="subdued">{emptyText}</s-text>
      </s-box>
    ) : null;
  }

  return (
    <s-box border="base" borderRadius="base" background="subdued" overflow="hidden">
      {collections.map((collection, index) => {
        const adminCollectionId = collection.id.split("/").pop();
        return (
          <s-box key={collection.id}>
            {index > 0 && <s-divider />}
            <s-box padding="small base">
              <s-stack direction="inline" alignItems="center" justifyContent="space-between">
                <s-stack direction="inline" alignItems="center" gap="base">
                  <s-icon type="collection" tone="subdued" />
                  <s-link
                    href={`shopify://admin/collections/${adminCollectionId}`}
                    target="_blank"
                  >
                    <strong>{collection.title || `Collection (${adminCollectionId})`}</strong>
                  </s-link>
                </s-stack>
                <s-button
                  variant="tertiary"
                  onClick={() => onRemove(collection.id)}
                  accessibilityLabel={`Remove ${collection.title}`}
                >
                  <s-icon type="x" />
                </s-button>
              </s-stack>
            </s-box>
          </s-box>
        );
      })}
    </s-box>
  );
}

// ─── Main App Component ────────────────────────────────────────────────────

function App() {
  const {
    applyExtensionMetafieldChange,
    i18n,
    config,
    initialConfig,
    onConfigChange,
    onSelectIncludedCollections,
    removeIncludedCollection,
    onSelectExcludedCollections,
    removeExcludedCollection,
    resetForm,
    loading,
  } = useExtensionData();

  // Live preview: 1x, 2x, 3x bundles
  const previewRows = useMemo(() => {
    const qty = parseInt(config.quantity, 10);
    const price = parseFloat(config.fixedPrice);
    if (isNaN(qty) || isNaN(price) || qty <= 0 || price <= 0) return [];
    return [1, 2, 3].map((multiplier) => ({
      multiplier,
      label: `${multiplier} Bundle${multiplier > 1 ? "s" : ""}`,
      items: qty * multiplier,
      total: `₹${(price * multiplier).toLocaleString("en-IN")}`,
    }));
  }, [config.quantity, config.fixedPrice]);

  if (loading) {
    return <s-text>{i18n.translate("loading")}</s-text>;
  }

  return (
    <s-function-settings
      onSubmit={(event) => event.waitUntil(applyExtensionMetafieldChange())}
      onReset={resetForm}
    >
      {/* Hidden fields so Shopify form dirty-state tracker activates the Save button */}
      <s-box display="none">
        <s-text-field
          name="includedCollectionIds"
          value={config.includedCollectionIds.join(",")}
          defaultValue={initialConfig.includedCollectionIds.join(",")}
        />
        <s-text-field
          name="excludedCollectionIds"
          value={config.excludedCollectionIds.join(",")}
          defaultValue={initialConfig.excludedCollectionIds.join(",")}
        />
      </s-box>

      {/* Main vertical stack with clean balanced spacing */}
      <s-stack gap="base">

        {/* ── 1. Bundle Rules ── */}
        <s-section heading="Bundle Rules">
          <s-stack gap="base">
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-number-field
                label="Bundle Quantity"
                name="quantity"
                value={String(config.quantity ?? "3")}
                defaultValue="3"
                min={1}
                step={1}
                details="Items required (e.g. 3 for BUY 3)"
                onChange={(event) => onConfigChange("quantity", event.currentTarget.value)}
              />

              <s-number-field
                label="Fixed Bundle Price"
                name="fixedPrice"
                value={String(config.fixedPrice ?? "999")}
                defaultValue="999"
                min={0}
                prefix="₹"
                details="Fixed price for 1 complete bundle"
                onChange={(event) => onConfigChange("fixedPrice", event.currentTarget.value)}
              />
            </s-grid>
          </s-stack>
        </s-section>

        {/* ── 2. Eligible Collections ── */}
        <s-section heading="Eligible Collections">
          <s-stack gap="base">
            <s-select
              label="Applies to"
              name="appliesTo"
              value={config.appliesTo}
              onChange={(event) => onConfigChange("appliesTo", event.currentTarget.value)}
            >
              <s-option value="all">All products (Storewide)</s-option>
              <s-option value="collections">Specific collections</s-option>
            </s-select>

            {config.appliesTo === "all" ? (
              <s-box padding="tight none">
                <s-banner tone="info">
                  This bundle offer applies to all products across your store, except any excluded collections specified below.
                </s-banner>
              </s-box>
            ) : (
              <s-box padding="tight none none none">
                <s-stack gap="tight">
                  <s-stack direction="inline" alignItems="center" justifyContent="space-between">
                    <s-text tone="subdued">
                      {config.includedCollections.length > 0
                        ? `${config.includedCollections.length} collection${config.includedCollections.length > 1 ? "s" : ""} selected for bundle`
                        : "Choose which collections trigger the bundle discount."}
                    </s-text>
                    <s-button onClick={onSelectIncludedCollections}>
                      Select Collections
                    </s-button>
                  </s-stack>

                  <CollectionsCard
                    collections={config.includedCollections}
                    onRemove={removeIncludedCollection}
                    emptyText="No collections selected yet. Click 'Select Collections' to select eligible collections."
                  />
                </s-stack>
              </s-box>
            )}
          </s-stack>
        </s-section>

        {/* ── 3. Excluded Collections ── */}
        <s-section heading="Excluded Collections">
          <s-stack gap="base">
            <s-stack direction="inline" alignItems="center" justifyContent="space-between">
              <s-text tone="subdued">
                {config.excludedCollections.length > 0
                  ? `${config.excludedCollections.length} collection${config.excludedCollections.length > 1 ? "s" : ""} excluded`
                  : "Products in excluded collections will never receive the bundle discount."}
              </s-text>
              <s-button onClick={onSelectExcludedCollections}>
                Select Excluded Collections
              </s-button>
            </s-stack>

            <CollectionsCard
              collections={config.excludedCollections}
              onRemove={removeExcludedCollection}
              emptyText="No collections excluded. All eligible products will receive the offer."
            />

            <s-box padding="tight none none none">
              <s-stack gap="tight">
                <s-divider />
                <s-stack direction="inline" alignItems="center" gap="tight">
                  <s-icon type="alert-circle" tone="subdued" />
                  <s-text tone="subdued">
                    Tip: Individual products tagged with <strong>exclude_bundle_discount</strong> are also automatically excluded.
                  </s-text>
                </s-stack>
              </s-stack>
            </s-box>
          </s-stack>
        </s-section>

        {/* ── 4. Price Tier Preview ── */}
        {previewRows.length > 0 && (
          <s-section heading="Price Tier Preview">
            <s-box border="base" borderRadius="base" background="subdued" overflow="hidden">
              {previewRows.map((row, idx) => (
                <s-box key={row.items}>
                  {idx > 0 && <s-divider />}
                  <s-box padding="small base">
                    <s-stack direction="inline" alignItems="center" justifyContent="space-between">
                      <s-stack direction="inline" alignItems="center" gap="base">
                        <s-badge tone="neutral">{row.label}</s-badge>
                        <s-text>{row.items} eligible items in cart</s-text>
                      </s-stack>
                      <s-stack direction="inline" alignItems="center" gap="base">
                        <s-text tone="subdued">Customer pays:</s-text>
                        <strong>{row.total}</strong>
                      </s-stack>
                    </s-stack>
                  </s-box>
                </s-box>
              ))}
            </s-box>
          </s-section>
        )}

      </s-stack>
    </s-function-settings>
  );
}
