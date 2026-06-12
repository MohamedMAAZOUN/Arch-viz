// ============================================================================
// MvpOverlayLegend — color → MVP key, shown only in overlay mode
// ============================================================================
// In overlay mode every node is tinted by the MVP that introduced it. This
// floating legend explains that mapping. It lists the MVPs visible at the
// current scrub position (order ≤ current) so the key matches the canvas.
// ============================================================================

import { useDocSnapshot } from "@/core/doc/useDocSnapshot";
import { useViewStore } from "@/core/state/viewStore";

import "@/features/mvp-slider/MvpOverlayLegend.css";

export default function MvpOverlayLegend() {
  const doc = useDocSnapshot();
  const mvpMode = useViewStore((s) => s.mvpMode);
  const currentMvp = useViewStore((s) => s.currentMvp);

  if (mvpMode !== "overlay" || doc === null) return null;

  const currentOrder = doc.mvps.find((m) => m.id === currentMvp)?.order ?? Infinity;
  const visibleMvps = [...doc.mvps]
    .filter((m) => m.order <= currentOrder)
    .sort((a, b) => a.order - b.order);

  if (visibleMvps.length === 0) return null;

  return (
    <aside className="mvp-legend" aria-label="MVP overlay legend">
      <div className="mvp-legend-title">introduced in</div>
      <ul className="mvp-legend-list">
        {visibleMvps.map((m) => (
          <li key={m.id} className="mvp-legend-row">
            <span
              className="mvp-legend-dot"
              style={{ background: m.color, boxShadow: `0 0 6px ${m.color}66` }}
            />
            <span className="mvp-legend-id">{m.id}</span>
            <span className="mvp-legend-name">{m.name}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
