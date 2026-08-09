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

// ─── Parse Metafield ───────────────────────────────────────────────────────

function parseMetafield(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return {
      quantity: parsed.quantity ?? "3",
      fixedPrice: parsed.fixedPrice ?? "999",
    };
  } catch {
    return {
      quantity: "3",
      fixedPrice: "999",
    };
  }
}

// ─── useExtensionData Hook ─────────────────────────────────────────────────

function useExtensionData() {
  const { applyMetafieldChange, i18n, data } = shopify;

  const metafieldConfig = useMemo(
    () =>
      parseMetafield(
        data?.metafields?.find(
          (metafield) => metafield.key === METAFIELD_KEY
        )?.value
      ),
    [data?.metafields]
  );

  const [config, setConfig] = useState(metafieldConfig);
  const [initialConfig, setInitialConfig] = useState(metafieldConfig);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setConfig(metafieldConfig);
    setInitialConfig(metafieldConfig);
  }, [metafieldConfig]);

  const onConfigChange = (key, value) => {
    setConfig((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  async function applyExtensionMetafieldChange() {
    await applyMetafieldChange({
      type: "updateMetafield",
      namespace: METAFIELD_NAMESPACE,
      key: METAFIELD_KEY,
      value: JSON.stringify(config),
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
    onConfigChange,
    resetForm,
    loading,
  };
}

// ─── TextField Component ───────────────────────────────────────────────────

function TextField({ label, value, onChange, name, info, defaultValue }) {
  return (
    <s-box>
      <s-stack gap="base">
        <s-text-field
          label={label}
          name={name}
          value={value}
          defaultValue={defaultValue}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        {info && <s-text tone="subdued">{info}</s-text>}
      </s-stack>
    </s-box>
  );
}

// ─── App ───────────────────────────────────────────────────────────────────

function App() {
  const {
    applyExtensionMetafieldChange,
    i18n,
    config,
    onConfigChange,
    resetForm,
    loading,
  } = useExtensionData();

  // Live preview: 1x, 2x, 3x bundles
  const previewRows = useMemo(() => {
    const qty = parseInt(config.quantity, 10);
    const price = parseFloat(config.fixedPrice);
    if (isNaN(qty) || isNaN(price) || qty <= 0 || price <= 0) return [];
    return [1, 2, 3].map((multiplier) => ({
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
      <s-stack gap="base">

        {/* ── Bundle Settings ── */}
        <s-section>
          <s-stack gap="base">

            <TextField
              label="Bundle Quantity"
              name="quantity"
              value={String(config.quantity ?? "3")}
              defaultValue="3"
              onChange={(value) => onConfigChange("quantity", value)}
              info="Number of items required to trigger the bundle (e.g. 3 for BUY3)"
            />

            <TextField
              label="Fixed Bundle Price (₹)"
              name="fixedPrice"
              value={String(config.fixedPrice ?? "999")}
              defaultValue="999"
              onChange={(value) => onConfigChange("fixedPrice", value)}
              info="The fixed price for one bundle (e.g. 999 for BUY3@999). Multiples are handled automatically."
            />

          </s-stack>
        </s-section>

        {/* ── Excluded Products Info ── */}
        <s-section>
          <s-text>Excluded Products</s-text>
          <s-stack gap="base">
            <s-text tone="subdued">
              Products tagged with "exclude_bundle_discount" will be excluded
              from the bundle discount and charged at full price.
            </s-text>
          </s-stack>
        </s-section>

        {/* ── Price Preview ── */}
        {previewRows.length > 0 && (
          <s-section>
            <s-text>Price Preview</s-text>
            <s-stack gap="base">
              {previewRows.map((row) => (
                <s-box key={row.items}>
                  <s-inline spacing="base">
                    <s-text>{row.items} items</s-text>
                    <s-text>→ Customer pays {row.total}</s-text>
                  </s-inline>
                </s-box>
              ))}
            </s-stack>
          </s-section>
        )}

      </s-stack>
    </s-function-settings>
  );
}