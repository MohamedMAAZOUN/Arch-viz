// ============================================================================
// downloadFile — trigger a browser download for a string or a data URL
// ============================================================================
// The one place we synthesize an <a download> click. Side-effecting by nature;
// kept tiny and isolated so callers (the export UI) stay declarative.
// ============================================================================

/** Download arbitrary text (JSON, SVG markup, …) as a file. */
export function downloadText(text: string, filename: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  try {
    triggerDownload(url, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Download a data URL (e.g. a PNG produced by html-to-image) as a file. */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  triggerDownload(dataUrl, filename);
}

function triggerDownload(href: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
