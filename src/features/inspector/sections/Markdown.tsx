// ============================================================================
// Markdown — renders the lib/markdown block tree into React elements
// ============================================================================
// No `dangerouslySetInnerHTML`: we render a parsed data structure, so there is
// no HTML-injection surface. Links open in a new tab with rel hardening.
// Theming via CSS variables in EditableField.css's sibling `.md-*` rules.
// ============================================================================

import { parseMarkdown } from "@/lib/markdown";

import type { Block, InlineNode } from "@/lib/markdown";

import "@/features/inspector/sections/Markdown.css";

export function Markdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div className="md">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "heading": {
      const Tag = `h${String(Math.min(block.level, 6))}` as "h1";
      return (
        <Tag className="md-heading" data-level={block.level}>
          <Inline nodes={block.children} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p className="md-paragraph">
          <Inline nodes={block.children} />
        </p>
      );
    case "quote":
      return (
        <blockquote className="md-quote">
          <Inline nodes={block.children} />
        </blockquote>
      );
    case "code":
      return (
        <pre className="md-code">
          <code>{block.value}</code>
        </pre>
      );
    case "list":
      return block.ordered ? (
        <ol className="md-list">
          {block.items.map((item, i) => (
            <li key={i}>
              <Inline nodes={item} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className="md-list">
          {block.items.map((item, i) => (
            <li key={i}>
              <Inline nodes={item} />
            </li>
          ))}
        </ul>
      );
  }
}

function Inline({ nodes }: { nodes: readonly InlineNode[] }) {
  return (
    <>
      {nodes.map((node, i) => (
        <InlineNodeView key={i} node={node} />
      ))}
    </>
  );
}

function InlineNodeView({ node }: { node: InlineNode }) {
  switch (node.kind) {
    case "text":
      return <>{node.value}</>;
    case "strong":
      return (
        <strong>
          <Inline nodes={node.children} />
        </strong>
      );
    case "em":
      return (
        <em>
          <Inline nodes={node.children} />
        </em>
      );
    case "code":
      return <code className="md-inline-code">{node.value}</code>;
    case "link":
      return (
        <a className="md-link" href={node.href} target="_blank" rel="noreferrer noopener">
          <Inline nodes={node.children} />
        </a>
      );
  }
}
