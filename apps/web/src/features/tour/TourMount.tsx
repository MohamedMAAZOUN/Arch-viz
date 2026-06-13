// ============================================================================
// TourMount — lazily mounts the TourPlayer only while a tour is active
// ============================================================================
// The player + its transport are dead weight until someone starts a tour, so
// we code-split them (per the performance guide) and mount behind a Suspense
// gate keyed on tour state. No fallback UI: the overlay simply appears once the
// chunk lands, a frame or two after the camera starts moving.
// ============================================================================

import { Suspense, lazy } from "react";

import { useTourStore } from "@/core/state/tourStore";

const TourPlayer = lazy(() => import("@/features/tour/TourPlayer"));

export default function TourMount() {
  const activeTourId = useTourStore((s) => s.activeTourId);
  if (activeTourId === null) return null;

  return (
    <Suspense fallback={null}>
      <TourPlayer />
    </Suspense>
  );
}
