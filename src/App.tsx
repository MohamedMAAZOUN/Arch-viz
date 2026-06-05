// ============================================================================
// App — top-level layout
// ============================================================================
// TopBar (app chrome) at the top. Below: a full-bleed canvas with three
// floating panels (view controls, navigator, inspector) hovering over it.
// Panel open/pin state is managed in uiStore via the panels themselves.
// ============================================================================

import { useDeleteSelectedShortcut } from "@/core/doc/useDeleteSelectedShortcut";
import { useUndoRedoShortcuts } from "@/core/doc/useUndoRedoShortcuts";
import Canvas from "@/features/canvas/Canvas";
import AddElementMenu from "@/features/element-editor/AddElementMenu";
import FileLoader from "@/features/file-loader/FileLoader";
import MvpOverlayLegend from "@/features/mvp-slider/MvpOverlayLegend";
import NotificationHost from "@/features/notifications/NotificationHost";
import FloatingPanels from "@/features/panels/FloatingPanels";
import ShortcutsOverlay from "@/features/shortcuts/ShortcutsOverlay";
import TopBar from "@/features/topbar/TopBar";
import TourLauncher from "@/features/tour/TourLauncher";
import TourMount from "@/features/tour/TourMount";

export default function App() {
  useUndoRedoShortcuts();
  useDeleteSelectedShortcut();

  return (
    <FileLoader>
      <div className="app-shell">
        <TopBar />
        <main className="app-stage">
          <Canvas />
          <AddElementMenu />
          <MvpOverlayLegend />
          <FloatingPanels />
          <TourLauncher />
          <TourMount />
        </main>
        <NotificationHost />
        <ShortcutsOverlay />
      </div>
    </FileLoader>
  );
}
