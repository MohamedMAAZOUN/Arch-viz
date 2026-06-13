// ============================================================================
// LayerToggle — switch between business / architecture / engineering
// ============================================================================
// Updates viewStore.currentLayer. The canvas + inspector + everything else
// react automatically through their store subscriptions.
// ============================================================================

import { useDocSnapshot } from "@/core/doc/useDocSnapshot";
import { useViewStore } from "@/core/state/viewStore";

import type { LayerId } from "@arch-vis/schema";

import "@/features/layer-toggle/LayerToggle.css";

const LAYERS: readonly { id: LayerId; label: string }[] = [
  { id: "business", label: "Business" },
  { id: "architecture", label: "Architecture" },
  { id: "engineering", label: "Engineering" },
];

export default function LayerToggle() {
  const doc = useDocSnapshot();
  const currentLayer = useViewStore((s) => s.currentLayer);
  const setLayer = useViewStore((s) => s.setLayer);

  if (doc === null) return null;

  return (
    <div className="layer-toggle" role="radiogroup" aria-label="Layer">
      <span className="layer-toggle-label">layer</span>
      <div className="layer-toggle-segments">
        {LAYERS.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={currentLayer === l.id}
            className="layer-toggle-btn"
            data-active={currentLayer === l.id}
            onClick={() => {
              setLayer(l.id);
            }}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
