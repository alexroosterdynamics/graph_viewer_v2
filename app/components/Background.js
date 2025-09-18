// app/components/Background.js
import React from "react";

// You can control the effect with these constants.
const CONSTELLATION_OPACITY = 0.7; // Controls transparency (0.0 to 1.0)
const CONSTELLATION_BLUR_PX = 1; // Controls blur in pixels (e.g., 0.5, 1, 2). Set to 0 for no blur.

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

  // Style for the main grid
  const gridStyle = {
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

  // Style for the optional scanline effect
  const scanlineStyle = {
    background: `linear-gradient(180deg, transparent, ${scanlineColor}, transparent)`,
  };

  // Base styles for a star layer.
  const starsBaseStyle = {
    backgroundImage:
      "radial-gradient(1px 1px at 25px 5px, white, transparent)," +
      "radial-gradient(1px 1px at 50px 25px, white, transparent)," +
      "radial-gradient(1px 1px at 125px 20px, white, transparent)," +
      "radial-gradient(1.5px 1.5px at 10px 80px, white, transparent)," +
      "radial-gradient(1.5px 1.5px at 90px 45px, white, transparent)," +
      "radial-gradient(1.5px 1.5px at 150px 95px, white, transparent)," +
      "radial-gradient(2px 2px at 75px 60px, white, transparent)," +
      "radial-gradient(2px 2px at 180px 30px, white, transparent)",
    backgroundRepeat: "repeat",
    position: "absolute",
    inset: "0",
  };

  // Styles for each layer
  const starsSmallStyle = { ...starsBaseStyle, backgroundSize: "200px 200px" };
  const starsMediumStyle = { ...starsBaseStyle, backgroundSize: "350px 350px" };
  const starsLargeStyle = { ...starsBaseStyle, backgroundSize: "500px 500px" };

  // Container style using the new constants for opacity and blur
  const constellationContainerStyle = {
    opacity: CONSTELLATION_OPACITY,
    filter: `blur(${CONSTELLATION_BLUR_PX}px)`,
  };

  return (
    <>
      {/* Original Grid Layer */}
      <div
        className="absolute inset-0 pointer-events-none z-0 bg-transparent opacity-15"
        style={gridStyle}
      >
        {showScanlines && (
          <div
            className="absolute inset-0 opacity-60 animate-scan"
            style={scanlineStyle}
          />
        )}
      </div>

      {/* Constellation Overlay Layer */}
      <div
        className="absolute inset-0 pointer-events-none z-0 overflow-hidden"
        style={constellationContainerStyle}
      >
        {/*
          UPDATED: Using vanilla Tailwind's `animate-pulse` with different delays
          to create a twinkling effect without changing any config files.
        */}
        <div className="animate-pulse" style={starsSmallStyle} />
        <div className="animate-pulse delay-300" style={starsMediumStyle} />
        <div className="animate-pulse delay-500" style={starsLargeStyle} />
      </div>
    </>
  );
}
