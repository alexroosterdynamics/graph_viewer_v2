//  app/components/widget.js

"use client";

import React from "react";
import { useRouter } from "next/navigation";

export default function Widget({
  draggable,
  showInterface,
  blurInterface,
  blurAmount,
  visibleDepth,
  labelsVisible,
  onToggleDrag,
  onToggleInterface,
  onToggleBlur,
  onDepthChange,
  onBlurAmountChange,
  onToggleLabels,

  // legend = [{ name, color, items:[], severity }]
  legend = [],
}) {
  const router = useRouter();

  const goToComponent = (name) => {
    if (!name) return;
    router.push(`/viewer?component=${encodeURIComponent(name)}`);
  };

  return (
    <>
      <style jsx="true">{`
        /* --- Checkbox Effects --- */
        input[type="checkbox"] {
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background-color: rgba(255, 255, 255, 0.05);
          cursor: pointer;
          position: relative;
          transition: all 0.2s ease-in-out;
        }

        input[type="checkbox"]:hover {
          border-color: rgba(255, 255, 255, 0.4);
          background-color: rgba(255, 255, 255, 0.1);
          transform: scale(1.05);
        }

        input[type="checkbox"]:checked {
          background-color: #22d3ee;
          border-color: #22d3ee;
          box-shadow: 0 0 10px #22d3ee;
          animation: pulse-glow 1s infinite alternate;
        }

        input[type="checkbox"]:checked::after {
          content: "✓";
          color: white;
          font-size: 16px;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          animation: check-scale 0.3s cubic-bezier(0.68, -0.55, 0.27, 1.55)
            forwards;
        }

        @keyframes check-scale {
          0% {
            transform: translate(-50%, -50%) scale(0);
          }
          100% {
            transform: translate(-50%, -50%) scale(1);
          }
        }

        @keyframes pulse-glow {
          from {
            box-shadow: 0 0 10px #22d3ee;
          }
          to {
            box-shadow: 0 0 20px #22d3ee;
          }
        }

        /* --- Slider Effects --- */
        input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 10px;
          background: linear-gradient(90deg, #d8b4fe, #ec4899);
          border-radius: 5px;
          outline: none;
          opacity: 0.8;
          transition: opacity 0.2s;
          cursor: pointer;
        }

        input[type="range"]:hover {
          opacity: 1;
        }

        /* Webkit (Chrome, Safari, Edge, Opera) */
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          background: #fff;
          border: 2px solid #fff;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
          transition: all 0.2s ease-in-out;
        }

        input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.1);
          box-shadow: 0 0 15px #ec4899;
          animation: thumb-glow 1.5s infinite alternate;
        }

        /* Firefox */
        input[type="range"]::-moz-range-thumb {
          width: 20px;
          height: 20px;
          background: #fff;
          border: 2px solid #fff;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
          transition: all 0.2s ease-in-out;
        }

        input[type="range"]::-moz-range-thumb:hover {
          transform: scale(1.1);
          box-shadow: 0 0 15px #ec4899;
          animation: thumb-glow 1.5s infinite alternate;
        }

        @keyframes thumb-glow {
          from {
            box-shadow: 0 0 10px #ec4899;
          }
          to {
            box-shadow: 0 0 20px #ec4899, 0 0 30px #ec4899;
          }
        }
      `}</style>
      <div
        className={`
          absolute top-3 left-3 z-20
          w-[23rem]                 /* ~15% wider */
          max-h-[calc(100vh-24px)]  /* cap to viewport */
          overflow-y-auto           /* widget scroll only */
          rounded-2xl bg-white/10 backdrop-blur-xl
          border border-white/20 p-4 shadow-xl space-y-4
          select-none
        `}
        style={{
          WebkitOverflowScrolling: "touch",
          scrollbarColor: "rgba(255,255,255,.35) transparent", // Firefox
        }}
      >
        {/* Header */}
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-white/70 h-full">
            Graph
          </div>
          <div className="text-lg font-semibold bg-gradient-to-r bg-cyan-300 bg-clip-text text-transparent">
            Controls
          </div>
        </div>

        {/* Controls */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm opacity-90">Draggable</span>
            <input
              type="checkbox"
              checked={draggable}
              onChange={onToggleDrag}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm opacity-90">Show Interface</span>
            <input
              type="checkbox"
              checked={showInterface}
              onChange={onToggleInterface}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm opacity-90">Blur Interface</span>
            <input
              type="checkbox"
              checked={blurInterface}
              onChange={onToggleBlur}
            />
          </div>

          <div>
            <label className="text-xs opacity-90">
              Blur Amount: {blurAmount.toFixed(1)}px
            </label>
            <input
              type="range"
              min="0"
              max="20"
              step="0.5"
              value={blurAmount}
              onChange={onBlurAmountChange}
              className="w-full accent-fuchsia-400"
            />
          </div>

          <div>
            <label className="text-xs opacity-90">
              Visible Depth: {visibleDepth}
            </label>
            <input
              type="range"
              min="1"
              max="6"
              step="1"
              value={visibleDepth}
              onChange={onDepthChange}
              className="w-full accent-pink-400"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm opacity-90">Labels</span>
            <input
              type="checkbox"
              checked={labelsVisible}
              onChange={onToggleLabels}
            />
          </div>
        </div>

        {/* Colors & Components */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[10px] uppercase tracking-[0.12em] text-white/70">
            Colors &amp; Components <b className="text-md">- BY SEVERITY</b>
          </div>

          <div className="mt-3 space-y-3">
            {legend.length === 0 && (
              <div className="text-xs text-white/50">
                No severity/component metadata found in this dataset.
              </div>
            )}

            {legend.map((sec, i) => (
              <div
                key={`${sec.name}-${i}`}
                className="rounded-lg bg-white/[0.04] border border-white/10 p-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-5 w-5 rounded-md"
                    style={{ backgroundColor: sec.color }}
                    title={sec.color}
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium leading-tight">
                      {sec.name}
                    </div>
                    {sec.severity != null && (
                      <div className="text-[11px] text-white/60">
                        Severity: {sec.severity}
                      </div>
                    )}
                  </div>
                </div>

                {/* Components list - clickable chips */}
                <div className="mt-2">
                  {sec.items && sec.items.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {sec.items.map((item, j) => (
                        <button
                          key={j}
                          type="button"
                          onClick={() => goToComponent(item)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              goToComponent(item);
                            }
                          }}
                          className={`
                            text-[11px] px-2 py-0.5 rounded-full
                            bg-white/10 border border-white/10 text-white/90
                            hover:bg-white/20 hover:border-white/20
                            focus:outline-none focus:ring-2 focus:ring-cyan-300
                            cursor-pointer
                          `}
                          title={`Filter by ${item}`}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-white/50">
                      No components listed
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-[11px] text-white/50">
          Function nodes are blue (#21B2F0). Descendants are tinted by severity
          (magenta).
        </div>
      </div>
    </>
  );
}
