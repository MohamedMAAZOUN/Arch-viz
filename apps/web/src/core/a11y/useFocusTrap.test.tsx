// ============================================================================
// useFocusTrap.test — focus stays inside the overlay and is restored on close
// ============================================================================

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { useFocusTrap } from "@/core/a11y/useFocusTrap";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        opener
      </button>
      {open ? (
        <Dialog
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function Dialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  return (
    <div ref={ref} role="dialog" aria-label="dialog">
      <button type="button">first</button>
      <button type="button">middle</button>
      <button type="button" onClick={onClose}>
        last
      </button>
    </div>
  );
}

afterEach(() => {
  cleanup();
});

describe("useFocusTrap", () => {
  it("moves focus into the dialog on open", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("opener"));
    expect(document.activeElement).toBe(screen.getByText("first"));
  });

  it("wraps Tab from the last focusable back to the first", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("opener"));

    const last = screen.getByText("last");
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByText("first"));
  });

  it("wraps Shift+Tab from the first focusable to the last", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("opener"));

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText("last"));
  });

  it("restores focus to the opener when the dialog closes", () => {
    render(<Harness />);
    const opener = screen.getByText("opener");
    opener.focus();
    fireEvent.click(opener);

    // Close from inside the dialog; focus should return to the opener.
    fireEvent.click(screen.getByText("last"));
    expect(document.activeElement).toBe(opener);
  });
});
