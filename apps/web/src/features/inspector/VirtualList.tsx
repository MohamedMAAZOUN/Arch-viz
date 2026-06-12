// ============================================================================
// VirtualList — a tiny windowed list for the inspector
// ============================================================================
// Renders only the rows intersecting the scroll viewport (plus a little
// overscan), so long result/dependency lists stay cheap. Per the engineering
// guide (§ 12), inspector lists past ~50 items virtualize; below that the plain
// list is fine and avoids the absolute-positioning machinery.
//
// Fixed row height. We only mount this when the list is longer than the
// viewport (the >50 case), so the scroller is always taller than its content
// and the viewport height equals `maxHeight` — no element measuring needed.
// ============================================================================

import { useMemo, useState } from "react";

import { visibleRange } from "@/lib/virtualWindow";

/** Above this many items, prefer the virtualized list. Matches the guide's
 *  "lists past 50 items use a virtualizer" rule. */
export const VIRTUALIZE_THRESHOLD = 50;

interface VirtualListProps<T> {
  readonly items: readonly T[];
  /** Height of one row INCLUDING the inter-row gap, in px. */
  readonly rowHeight: number;
  /** Height of the scroll viewport, in px. */
  readonly maxHeight: number;
  /** Extra rows rendered above/below the viewport to mask fast scrolling. */
  readonly overscan?: number;
  readonly getKey: (item: T, index: number) => string;
  readonly renderRow: (item: T, index: number) => React.ReactNode;
  readonly ariaLabel?: string;
}

export function VirtualList<T>({
  items,
  rowHeight,
  maxHeight,
  overscan = 6,
  getKey,
  renderRow,
  ariaLabel,
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);

  const { start, end } = useMemo(
    () => visibleRange(scrollTop, maxHeight, rowHeight, items.length, overscan),
    [scrollTop, maxHeight, rowHeight, items.length, overscan],
  );

  const totalHeight = items.length * rowHeight;

  return (
    <ul
      className="inspector-list virtual-list"
      role="list"
      aria-label={ariaLabel}
      style={{ height: maxHeight }}
      onScroll={(e) => {
        setScrollTop(e.currentTarget.scrollTop);
      }}
    >
      <li className="virtual-list-spacer" aria-hidden style={{ height: totalHeight }} />
      {items.slice(start, end).map((item, i) => {
        const index = start + i;
        return (
          <li
            key={getKey(item, index)}
            className="virtual-list-row"
            style={{ transform: `translateY(${String(index * rowHeight)}px)` }}
          >
            {renderRow(item, index)}
          </li>
        );
      })}
    </ul>
  );
}
