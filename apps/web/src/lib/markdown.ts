// ============================================================================
// markdown — a tiny, safe Markdown parser
// ============================================================================
// Pure (no React, no DOM): turns a Markdown string into a block tree the
// inspector's <Markdown> component renders into React elements. We parse to a
// data structure rather than HTML so rendering never needs `dangerouslySetInnerHTML`
// — there is no HTML-injection surface.
//
// Deliberately small. Supported: ATX headings (#..######), fenced code blocks,
// blockquotes, unordered/ordered lists, paragraphs, and inline strong / emphasis
// / code / links. Nested lists and tables are out of scope (v1.5 if ever needed).
// ============================================================================

export type InlineNode =
  | { kind: "text"; value: string }
  | { kind: "strong"; children: readonly InlineNode[] }
  | { kind: "em"; children: readonly InlineNode[] }
  | { kind: "code"; value: string }
  | { kind: "link"; href: string; children: readonly InlineNode[] };

export type Block =
  | { kind: "heading"; level: number; children: readonly InlineNode[] }
  | { kind: "paragraph"; children: readonly InlineNode[] }
  | { kind: "list"; ordered: boolean; items: readonly (readonly InlineNode[])[] }
  | { kind: "code"; value: string }
  | { kind: "quote"; children: readonly InlineNode[] };

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const UNORDERED_RE = /^[-*+]\s+(.*)$/;
const ORDERED_RE = /^\d+\.\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;

/** Parse a Markdown string into a flat list of blocks. */
export function parseMarkdown(source: string): readonly Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
        code.push(lines[i] ?? "");
        i += 1;
      }
      i += 1; // skip closing fence
      blocks.push({ kind: "code", value: code.join("\n") });
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading !== null) {
      blocks.push({
        kind: "heading",
        level: heading[1]?.length ?? 1,
        children: parseInline(heading[2] ?? ""),
      });
      i += 1;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i] ?? "")) {
        quoteLines.push(QUOTE_RE.exec(lines[i] ?? "")?.[1] ?? "");
        i += 1;
      }
      blocks.push({ kind: "quote", children: parseInline(quoteLines.join(" ")) });
      continue;
    }

    const listMatch = matchListItem(line);
    if (listMatch !== null) {
      const ordered = listMatch.ordered;
      const items: InlineNode[][] = [];
      while (i < lines.length) {
        const item = matchListItem(lines[i] ?? "");
        if (item === null || item.ordered !== ordered) break;
        items.push([...parseInline(item.text)]);
        i += 1;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    // Paragraph: consume consecutive non-blank lines that aren't another block.
    const paragraph: string[] = [];
    while (i < lines.length) {
      const current = lines[i] ?? "";
      if (
        current.trim() === "" ||
        HEADING_RE.test(current) ||
        current.trim().startsWith("```") ||
        QUOTE_RE.test(current) ||
        matchListItem(current) !== null
      ) {
        break;
      }
      paragraph.push(current.trim());
      i += 1;
    }
    blocks.push({ kind: "paragraph", children: parseInline(paragraph.join(" ")) });
  }

  return blocks;
}

function matchListItem(line: string): { ordered: boolean; text: string } | null {
  const unordered = UNORDERED_RE.exec(line);
  if (unordered !== null) return { ordered: false, text: unordered[1] ?? "" };
  const ordered = ORDERED_RE.exec(line);
  if (ordered !== null) return { ordered: true, text: ordered[1] ?? "" };
  return null;
}

// ----------------------------------------------------------------------------
// Inline parsing
// ----------------------------------------------------------------------------
// Scan left to right, peeling the earliest recognised delimiter. Code spans win
// over everything (their contents are literal); links, then strong, then emphasis.

export function parseInline(text: string): readonly InlineNode[] {
  const nodes: InlineNode[] = [];
  let rest = text;

  while (rest.length > 0) {
    const token = nextToken(rest);
    if (token === null) {
      pushText(nodes, rest);
      break;
    }
    if (token.before.length > 0) pushText(nodes, token.before);
    nodes.push(token.node);
    rest = token.after;
  }

  return nodes;
}

interface Token {
  before: string;
  node: InlineNode;
  after: string;
}

function nextToken(text: string): Token | null {
  const candidates = [
    matchDelimited(text, "`", (value) => ({ kind: "code", value })),
    matchLink(text),
    matchDelimited(text, "**", (inner) => ({ kind: "strong", children: parseInline(inner) })),
    matchDelimited(text, "__", (inner) => ({ kind: "strong", children: parseInline(inner) })),
    matchDelimited(text, "*", (inner) => ({ kind: "em", children: parseInline(inner) })),
    matchDelimited(text, "_", (inner) => ({ kind: "em", children: parseInline(inner) })),
  ].filter((c): c is Token => c !== null);

  if (candidates.length === 0) return null;
  // Pick the token that starts earliest in the string.
  return candidates.reduce((best, c) => (c.before.length < best.before.length ? c : best));
}

/** Match `<delim>content<delim>` where content is non-empty and has no delimiter. */
function matchDelimited(
  text: string,
  delim: string,
  build: (inner: string) => InlineNode,
): Token | null {
  const open = text.indexOf(delim);
  if (open === -1) return null;
  const close = text.indexOf(delim, open + delim.length);
  if (close === -1) return null;
  const inner = text.slice(open + delim.length, close);
  if (inner.length === 0) return null;
  return {
    before: text.slice(0, open),
    node: build(inner),
    after: text.slice(close + delim.length),
  };
}

/** Match `[text](href)`; rejects unsafe hrefs (renders them as literal text). */
function matchLink(text: string): Token | null {
  const match = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(text);
  if (match === null) return null;
  const href = match[2] ?? "";
  if (!isSafeHref(href)) return null;
  return {
    before: text.slice(0, match.index),
    node: { kind: "link", href, children: parseInline(match[1] ?? "") },
    after: text.slice(match.index + match[0].length),
  };
}

function isSafeHref(href: string): boolean {
  return /^(https?:\/\/|mailto:|\/|#)/.test(href);
}

function pushText(nodes: InlineNode[], value: string): void {
  if (value.length > 0) nodes.push({ kind: "text", value });
}
