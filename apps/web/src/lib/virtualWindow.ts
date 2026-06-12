// ============================================================================
// virtualWindow — windowing math for a fixed-row virtualized list
// ============================================================================
// Pure, DOM-free so it can be unit-tested directly. Consumed by the inspector's
// VirtualList component.
// ============================================================================

/**
 * The half-open range [start, end) of rows that intersect the viewport, clamped
 * to the item count and padded by `overscan` rows on each side.
 */
export function visibleRange(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  count: number,
  overscan: number,
): { start: number; end: number } {
  if (count === 0 || rowHeight <= 0) return { start: 0, end: 0 };
  const first = Math.floor(scrollTop / rowHeight);
  const visibleCount = Math.ceil(viewportHeight / rowHeight);
  const start = Math.max(0, first - overscan);
  const end = Math.min(count, first + visibleCount + overscan);
  return { start, end };
}
