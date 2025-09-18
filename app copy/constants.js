// app/constants.js
export const ROOT_ID = 0;

// Timing
export const TIMING = {
  settleTreeMs: 1000,
  fitDurationMs: 200,
};

// Forces
export const FORCE = {
  tree: {
    linkDistance: 55,
    linkStrength: 0.9,
    charge: -1,
  },
  interface: {
    linkDistance: 5,
    linkStrength: 0.35,
    charge: -700,
  },
};

// Visuals (tree)
export const STYLE = {
  nodeRadiusPx: 10,

  // Tree node fills
  nodeFillColor: "#21B2F0", // non-root tree nodes
  rootFillColor: "#F021B2", // current root fill color

  // Global-view root size multiplier
  rootScaleGlobal: 1.6,

  // Stroke (outline)
  nodeStrokeColor: "black",
  nodeStrokeWidth: 1,

  // Links & labels
  linkColor: "#ffffff",
  linkWidth: 2,
  labelPx: 5,
  labelColor: "white",
  minZoomFontScale: 0.7,
};

// Interface visuals
export const IFSTYLE = {
  nodeFill: "#6b7280", // gray-500
  nodeStroke: "#9ca3af", // gray-400
  nodeStrokeWidth: 1.0,
  nodeScaleMul: 0.9,
  labelColor: "#9ca3af",
  linkColor: "#9ca3af",
  linkWidth: 0.2,
};

// Blur for interface layer
export const BLUR = {
  amountPx: 2.5,
};

// Initial placement helper for interface-only nodes
export const IFPLACEMENT = {
  ringRadiusPx: 56,
  startDeg: 210,
  endDeg: 330,
  marginDeg: 6,
};

// Labels under nodes
export const LABELS = {
  gapPx: 6,
  background: true,
  bckgPaddingPx: 2,
  bckgFill: "rgba(17,24,39,0.85)",
};

// Camera fit
export const VIEW = {
  fitPadding: 120,
};

// Local-view depth (how many child levels to show around clicked node)
export const LOCAL = {
  visibleDepth: 2,
};

// Local-view scaling
export const LOCAL_SCALING = {
  rootScaleMul: 2.0, // focused node multiplier in local view
  childDecay: 0.85, // each deeper level is previous × this
};

// User toggles
export const FLAGS = {
  draggable: false,
  showInterface: true,
  blurInterface: false,
};

export const arrowStyle = {
  length: 3,
  relPosPadPx: 15,
  resolution: 8,
  colorChild: "#ffffff",
  colorInterface: "#9ca3af",
};

// configurable background
export const BACKGROUND = {
  use_custom_bg: true, // enable/disable the custom board background
  bgColor: "#0b1e3a", // deep blue board
  minorColor: "rgba(173,216,230,0.12)", // light-cyan minor grid
  majorColor: "rgba(173,216,230,0.22)", // stronger grid
  minorStep: 20,
  majorStep: 100,
  showScanlines: true,
  scanlineColor: "rgba(255,255,255,0.04)",
};
