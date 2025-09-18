// app/components/Background.js
import React from "react";

export default function Background({ config }) {
  const {
    bgColor,
    minorColor,
    majorColor,
    minorStep,
    majorStep,
    showScanlines,
    scanlineColor,
  } = config;

  const style = {
    backgroundColor: bgColor,
    backgroundImage: `
      repeating-linear-gradient(
        0deg,
        ${minorColor},
        ${minorColor} 1px,
        transparent 1px,
        transparent ${minorStep}px
      ),
      repeating-linear-gradient(
        90deg,
        ${minorColor},
        ${minorColor} 1px,
        transparent 1px,
        transparent ${minorStep}px
      ),
      repeating-linear-gradient(
        0deg,
        ${majorColor},
        ${majorColor} 2px,
        transparent 2px,
        transparent ${majorStep}px
      ),
      repeating-linear-gradient(
        90deg,
        ${majorColor},
        ${majorColor} 2px,
        transparent 2px,
        transparent ${majorStep}px
      )
    `,
  };

  const scanlineStyle = {
    background: `linear-gradient(180deg, transparent, ${scanlineColor}, transparent)`,
  };

  return (
    <div
      className="absolute inset-0 pointer-events-none z-0 bg-transparent opacity-15"
      style={style}
    >
      {showScanlines && (
        <div
          className="absolute inset-0 opacity-60 animate-scan"
          style={scanlineStyle}
        />
      )}
    </div>
  );
}
