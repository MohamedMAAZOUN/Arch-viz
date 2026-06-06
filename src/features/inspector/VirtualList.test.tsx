// ============================================================================
// VirtualList.test — windowing math + "doesn't render everything" behavior
// ============================================================================

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { VirtualList } from "@/features/inspector/VirtualList";

afterEach(() => {
  cleanup();
});

describe("VirtualList", () => {
  it("renders only a window of rows, not the whole list", () => {
    const items = Array.from({ length: 1000 }, (_, i) => `item-${String(i)}`);
    render(
      <VirtualList
        items={items}
        rowHeight={40}
        maxHeight={300}
        getKey={(it) => it}
        renderRow={(it) => <span>{it}</span>}
        ariaLabel="Test list"
      />,
    );

    // A windowed list mounts a small fraction of the rows, never all 1000.
    const rendered = screen.getAllByText(/^item-\d+$/);
    expect(rendered.length).toBeLessThan(40);
    expect(screen.getByText("item-0")).toBeInTheDocument();
    expect(screen.queryByText("item-900")).not.toBeInTheDocument();
  });

  it("reveals later rows after scrolling", () => {
    const items = Array.from({ length: 1000 }, (_, i) => `item-${String(i)}`);
    render(
      <VirtualList
        items={items}
        rowHeight={40}
        maxHeight={300}
        getKey={(it) => it}
        renderRow={(it) => <span>{it}</span>}
        ariaLabel="Test list"
      />,
    );

    const list = screen.getByRole("list", { name: "Test list" });
    fireEvent.scroll(list, { target: { scrollTop: 4000 } });

    expect(screen.getByText("item-100")).toBeInTheDocument();
    expect(screen.queryByText("item-0")).not.toBeInTheDocument();
  });
});
