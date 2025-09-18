"use client";

import React from "react";

/**
 * Glassmorphism option panel that anchors above a node.
 * Props:
 *  - anchor: {x,y} in screen coords
 *  - visible: boolean
 *  - options: [{ key, title, used }]
 *  - lockedKey: string|null (the option currently being named)
 *  - onPick: (key) => void
 */
export default function SelectionOverlay({
  anchor,
  visible,
  options = [],
  lockedKey = null,
  onPick,
}) {
  if (!visible || !anchor) return null;

  return (
    <div
      className="
        fixed z-40 -translate-x-1/2 -translate-y-full
        rounded-xl border border-white/20 bg-white/10 backdrop-blur-xl
        shadow-lg p-2 flex items-center gap-2
      "
      style={{ left: anchor.x, top: anchor.y - 8 }}
    >
      {options.map((opt) => {
        const isLocked = lockedKey && lockedKey !== opt.key;
        const isActive = lockedKey === opt.key || opt.used;

        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onPick?.(opt.key)}
            disabled={isLocked}
            className={`
              px-3 py-1 rounded-lg text-sm
              border transition
              ${
                isActive
                  ? "bg-fuchsia-500/80 border-fuchsia-400 text-white"
                  : "bg-white/10 border-white/20 text-white/90 hover:bg-white/20"
              }
              ${isLocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
            `}
            title={
              isLocked
                ? "Finish naming/cancel current node to choose another"
                : isActive
                ? "Click again to revert to placeholder"
                : "Create this option"
            }
          >
            {opt.title}
          </button>
        );
      })}
    </div>
  );
}
