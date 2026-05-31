// ============================================================================
// App — top-level layout
// ============================================================================
// TopBar (app chrome) at the top. Below: a full-bleed canvas with three
// floating panels (view controls, navigator, inspector) hovering over it.
// Panel open/pin state is managed in uiStore via the panels themselves.
// ============================================================================

import { useUndoRedoShortcuts } from "@/core/doc/useUndoRedoShortcuts";
import Canvas from "@/features/canvas/Canvas";
import FileLoader from "@/features/file-loader/FileLoader";
import FloatingPanels from "@/features/panels/FloatingPanels";
import TopBar from "@/features/topbar/TopBar";
import TourLauncher from "@/features/tour/TourLauncher";
import TourMount from "@/features/tour/TourMount";

export default function App() {
  useUndoRedoShortcuts();

  return (
    <FileLoader>
      <div className="app-shell">
        <TopBar />
        <main className="app-stage">
          <Canvas />
          <FloatingPanels />
          <TourLauncher />
          <TourMount />
        </main>
      </div>
    </FileLoader>
  );
}
