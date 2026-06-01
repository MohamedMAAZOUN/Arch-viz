import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditableField } from "@/features/inspector/sections/EditableField";

afterEach(cleanup);

/** Numeric validator mirroring the inspector's number field. */
const numberValidator = (draft: string) => {
  const trimmed = draft.trim();
  if (trimmed === "") return "Enter a number";
  return Number.isFinite(Number(trimmed)) ? null : "Must be a number";
};

function enterEditMode() {
  fireEvent.click(screen.getByRole("button"));
  return screen.getByRole("textbox");
}

describe("EditableField validation", () => {
  it("commits valid input via onChange", () => {
    const onChange = vi.fn();
    render(<EditableField value="42" onChange={onChange} validate={numberValidator} />);

    const input = enterEditMode();
    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("100");
  });

  it("shows an inline error and blocks commit on invalid input", () => {
    const onChange = vi.fn();
    render(<EditableField value="42" onChange={onChange} validate={numberValidator} />);

    const input = enterEditMode();
    fireEvent.change(input, { target: { value: "abc" } });

    // Visible feedback explaining why nothing happened.
    expect(screen.getByRole("alert")).toHaveTextContent("Must be a number");
    expect(input).toHaveAttribute("aria-invalid", "true");

    // Enter does not commit; the field stays in edit mode (input still present).
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("blur does not silently commit invalid input", () => {
    const onChange = vi.fn();
    render(<EditableField value="42" onChange={onChange} validate={numberValidator} />);

    const input = enterEditMode();
    fireEvent.change(input, { target: { value: "12x" } });
    fireEvent.blur(input);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("Escape cancels and reverts without committing", () => {
    const onChange = vi.fn();
    render(<EditableField value="42" onChange={onChange} validate={numberValidator} />);

    const input = enterEditMode();
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onChange).not.toHaveBeenCalled();
    // Back to display mode showing the original value.
    expect(screen.getByRole("button")).toHaveTextContent("42");
  });
});
