// ============================================================================
// ViewControlsPanel — contents of the top floating panel
// ============================================================================
// The view-state controls (layer, reorganize, MVP) gathered into one row.
// These used to live in the TopBar; they're view-state, so they belong with
// the canvas rather than the app chrome.
// ============================================================================

import DisplayControls from "@/features/layer-toggle/DisplayControls";
import LayerToggle from "@/features/layer-toggle/LayerToggle";
import ReorganizeButton from "@/features/layer-toggle/ReorganizeButton";
import MvpSlider from "@/features/mvp-slider/MvpSlider";

import "@/features/panels/ViewControlsPanel.css";

export default function ViewControlsPanel() {
  return (
    <div className="view-controls">
      <LayerToggle />
      <ReorganizeButton />
      <DisplayControls />
      <MvpSlider />
    </div>
  );
}
