// ============================================================================
// MultiSelectionSummary — inspector view when several elements are selected
// ============================================================================
// The per-element inspector only makes sense for one element, so when a
// box-select or shift-click leaves several selected we show a roster plus the
// bulk actions that apply to the whole set. Clicking a row narrows the
// selection down to that single element.
// ============================================================================

import { deleteSelectedElements } from "@/core/doc/deleteSelection";
import { useDocSnapshot } from "@/core/doc/useDocSnapshot";
import { useSelectionStore } from "@/core/state/selectionStore";
import { Section } from "@/features/inspector/sections/Section";

export default function MultiSelectionSummary({ ids }: { ids: readonly string[] }) {
  const doc = useDocSnapshot();
  const select = useSelectionStore((s) => s.select);
  const clear = useSelectionStore((s) => s.clear);

  if (doc === null) return null;

  const byId = new Map(doc.elements.map((e) => [e.id, e]));

  return (
    <Section title="Selection" defaultOpen>
      <div className="inspector-multi-count">{ids.length} elements selected</div>
      <ul className="inspector-list">
        {ids.map((id) => {
          const el = byId.get(id);
          return (
            <li key={id}>
              <button
                type="button"
                className="inspector-search-result"
                onClick={() => {
                  select(id);
                }}
              >
                <span className="inspector-search-result-name">{el?.name ?? id}</span>
                <span className="inspector-search-result-meta">{el?.type ?? "unknown"}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="inspector-multi-actions">
        <button type="button" className="inspector-multi-action" onClick={clear}>
          Clear selection
        </button>
        <button
          type="button"
          className="inspector-multi-action inspector-multi-action--danger"
          onClick={deleteSelectedElements}
        >
          Delete {ids.length}
        </button>
      </div>
    </Section>
  );
}
