// ============================================================================
// App — top-level layout
// ============================================================================
// TopBar at the top. Below: canvas + inspector with a user-resizable split.
// Inspector width and visibility are persisted via uiStore.
// ============================================================================

import { useUndoRedoShortcuts } from "@/core/doc/useUndoRedoShortcuts";
import { useUiStore } from "@/core/state/uiStore";
import Canvas from "@/features/canvas/Canvas";
import FileLoader from "@/features/file-loader/FileLoader";
import Inspector from "@/features/inspector/Inspector";
import TopBar from "@/features/topbar/TopBar";

export default function App() {
  useUndoRedoShortcuts();

  const inspectorOpen = useUiStore((s) => s.inspectorOpen);
  const inspectorWidth = useUiStore((s) => s.inspectorWidth);

  // Honor the stored pixel width; fall back to the golden-ratio CSS default.
  const shellStyle =
    inspectorWidth !== null
      ? ({ ["--inspector-width" as string]: `${String(inspectorWidth)}px` } as React.CSSProperties)
      : undefined;

  return (
    <FileLoader>
      <div className="app-shell" style={shellStyle}>
        <TopBar />
        <main className="app-main" data-inspector-open={inspectorOpen}>
          <div className="app-canvas">
            <Canvas />
          </div>
          <aside className="app-inspector">
            <Inspector />
          </aside>
        </main>
      </div>
    </FileLoader>
  );
}
