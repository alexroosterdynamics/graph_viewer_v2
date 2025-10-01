// app/page.js
"use client";

import { useState } from "react";
import graphData from "./data.json";
import FunctionsGraph from "./components/FunctionsGraph";

export default function Page() {
  // available: "simple" | "card" | "glossy" (original)
  const [mode, setMode] = useState("glossy");

  const options = [
    { key: "simple", label: "Simple" },
    { key: "card", label: "Card" },
    { key: "glossy", label: "Original" },
  ];

  return (
    <div className="relative h-screen w-screen">
      {/* Top-center mode switch */}
      <div className="fixed left-1/2 top-3 z-50 -translate-x-1/2">
        <div className="flex items-center gap-1 rounded-xl bg-white/10 backdrop-blur-xl border border-white/20 p-1 shadow-lg">
          {options.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setMode(opt.key)}
              className={`px-3 py-1.5 text-sm rounded-lg transition
                ${mode === opt.key ? "bg-white/20 text-white" : "text-white/70 hover:text-white"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Graph, pass the selected mode down */}
      <FunctionsGraph data={graphData} nodeStyle={mode} />
    </div>
  );
}
