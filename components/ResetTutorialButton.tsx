"use client";

import { useState } from "react";
import { resetTour } from "@/components/starmap/Tutorial";
import { resetQuest } from "@/components/starmap/Quest";

/** Testing only: show the Sky Explorer tour (and the rescue mission offer) again, in this browser. */
export default function ResetTutorialButton() {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="h-reset-tour"
      onClick={() => {
        resetTour();
        resetQuest();
        setDone(true);
        setTimeout(() => setDone(false), 2200);
      }}
      title="Testing: show the Sky Explorer tour again (this browser only)"
    >
      {done ? "Tutorial reset ✓" : "Reset tutorial"}
    </button>
  );
}
