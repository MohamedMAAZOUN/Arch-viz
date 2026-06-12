// ============================================================================
// MvpSlider — chips showing all MVPs, current one highlighted
// ============================================================================
// Each chip carries the MVP's signature color (from the schema's mvps[].color
// field). The current MVP gets a thicker ring + accent background.
// ============================================================================

import { useDocSnapshot } from "@/core/doc/useDocSnapshot";
import { useViewStore } from "@/core/state/viewStore";

import "@/features/mvp-slider/MvpSlider.css";

export default function MvpSlider() {
  const doc = useDocSnapshot();
  const currentMvp = useViewStore((s) => s.currentMvp);
  const setMvp = useViewStore((s) => s.setMvp);
  const mvpMode = useViewStore((s) => s.mvpMode);
  const setMvpMode = useViewStore((s) => s.setMvpMode);

  if (doc === null || doc.mvps.length === 0) return null;

  // Sort by order so chips read left → right chronologically
  const sortedMvps = [...doc.mvps].sort((a, b) => a.order - b.order);

  return (
    <div className="mvp-slider" role="group" aria-label="MVP">
      <span className="mvp-slider-label">mvp</span>
      <div className="mvp-mode-toggle" role="radiogroup" aria-label="MVP display mode">
        <button
          type="button"
          role="radio"
          aria-checked={mvpMode === "single"}
          className="mvp-mode-btn"
          data-active={mvpMode === "single"}
          onClick={() => {
            setMvpMode("single");
          }}
          title="Show one MVP at a time"
        >
          single
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mvpMode === "overlay"}
          className="mvp-mode-btn"
          data-active={mvpMode === "overlay"}
          onClick={() => {
            setMvpMode("overlay");
          }}
          title="Color every element by the MVP that introduced it"
        >
          overlay
        </button>
      </div>
      <div className="mvp-slider-chips" role="radiogroup" aria-label="Current MVP">
        {sortedMvps.map((m) => {
          const active = currentMvp === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={active}
              className="mvp-chip"
              data-active={active}
              onClick={() => {
                setMvp(m.id);
              }}
              title={m.name}
            >
              <span
                className="mvp-chip-dot"
                style={{ background: m.color, boxShadow: `0 0 6px ${m.color}66` }}
              />
              <span className="mvp-chip-label">{m.id}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
