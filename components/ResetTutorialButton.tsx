"use client";

import { useState } from "react";
import { resetTour } from "@/components/starmap/Tutorial";

/** Testing only: show the Sky Explorer tour again and restart the Campaign, in this browser. */
export default function ResetTutorialButton() {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="h-reset-tour"
      onClick={() => {
        resetTour();
        try {
          localStorage.removeItem("campaign.progress.v1");
        } catch {}
        setDone(true);
        setTimeout(() => setDone(false), 2200);
      }}
      title="Testing: show the Sky Explorer tour again and restart the Campaign (this browser only)"
    >
      {done ? "Tutorial reset ✓" : "Reset tutorial"}
    </button>
  );
}
