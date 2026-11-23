// components/sheets/Overlays.tsx
// Pop-ups and toasts for a screen or modal that opens over the app (#86).
// iOS shows pop-ups only from the top-most one, and the root's toasts draw
// under a modal, so each one mounts this. The newest mounted wins; closing
// it hands back to the one below.

import React from "react";

import SheetHost from "@/components/sheets/SheetHost";
import ToastHost from "@/components/sheets/ToastHost";

export default function Overlays({toasts = true}: {toasts?: boolean}) {
  return (
    <>
      <SheetHost />
      {toasts && <ToastHost />}
    </>
  );
}
