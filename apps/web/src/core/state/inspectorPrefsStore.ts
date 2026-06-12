// ============================================================================
// inspectorPrefsStore — persisted inspector section open/collapse state
// ============================================================================
// Inspector sections (Overview, Properties, Dependencies, …) are collapsible.
// Their open state used to live in each Section's local useState, so it reset
// on every reload AND every selection change (selecting another element
// remounts the section components). This store lifts that state out and keys it
// by section title, so a section the user collapsed stays collapsed across
// reloads and as they move between elements. Titles are unique across the
// inspector's panels, so a single flat map is enough.
// ============================================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";

const STORAGE_KEY = "architecture-visualizer:inspector-prefs";

export interface InspectorPrefsState {
  /** Section title → explicit open state. Absent means "use the default". */
  sectionOpen: Readonly<Record<string, boolean>>;
  setSectionOpen: (title: string, open: boolean) => void;
}

export const useInspectorPrefsStore = create<InspectorPrefsState>()(
  persist(
    (set) => ({
      sectionOpen: {},
      setSectionOpen: (title, open) => {
        set((s) => ({ sectionOpen: { ...s.sectionOpen, [title]: open } }));
      },
    }),
    { name: STORAGE_KEY, version: 1 },
  ),
);
