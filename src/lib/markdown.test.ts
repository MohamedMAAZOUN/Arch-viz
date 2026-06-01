// ============================================================================
// markdown.test.ts — the tiny Markdown parser
// ============================================================================

import { describe, expect, it } from "vitest";

import { parseInline, parseMarkdown } from "@/lib/markdown";

describe("parseMarkdown — blocks", () => {
  it("parses ATX headings with their level", () => {
    const [block] = parseMarkdown("### Title");
    expect(block).toMatchObject({ kind: "heading", level: 3 });
  });

  it("groups consecutive lines into one paragraph", () => {
    const blocks = parseMarkdown("line one\nline two");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.kind).toBe("paragraph");
  });

  it("separates paragraphs on a blank line", () => {
    const blocks = parseMarkdown("para one\n\npara two");
    expect(blocks).toHaveLength(2);
  });

  it("parses an unordered list of items", () => {
    const [block] = parseMarkdown("- a\n- b\n- c");
    expect(block).toMatchObject({ kind: "list", ordered: false });
    if (block?.kind === "list") expect(block.items).toHaveLength(3);
  });

  it("parses an ordered list", () => {
    const [block] = parseMarkdown("1. first\n2. second");
    expect(block).toMatchObject({ kind: "list", ordered: true });
  });

  it("parses a fenced code block verbatim", () => {
    const [block] = parseMarkdown("```\nconst x = 1;\n```");
    expect(block).toEqual({ kind: "code", value: "const x = 1;" });
  });

  it("parses a blockquote", () => {
    const [block] = parseMarkdown("> quoted");
    expect(block?.kind).toBe("quote");
  });
});

describe("parseInline — spans", () => {
  it("parses strong and emphasis", () => {
    const nodes = parseInline("a **bold** and _italic_");
    expect(nodes.map((n) => n.kind)).toEqual(["text", "strong", "text", "em"]);
  });

  it("parses inline code literally", () => {
    const nodes = parseInline("call `foo()` now");
    expect(nodes[1]).toEqual({ kind: "code", value: "foo()" });
  });

  it("parses a safe link", () => {
    const nodes = parseInline("see [docs](https://example.com)");
    expect(nodes[1]).toMatchObject({ kind: "link", href: "https://example.com" });
  });

  it("rejects an unsafe javascript: link, keeping it as text", () => {
    const nodes = parseInline("[x](javascript:alert(1))");
    expect(nodes.every((n) => n.kind === "text")).toBe(true);
  });
});
