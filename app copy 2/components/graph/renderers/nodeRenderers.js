"use client";

/**
 * Node renderers: classic | card | simple
 * - Classic: glossy gradient sphere + label below.
 * - Card: rounded card sized to label; label inside. Interface nodes => gray border.
 * - Simple: semi-transparent-looking circle with thin border + label below.
 *
 * Each renderer paints an opaque “blocker” (canvasBg) first to hide lines underneath.
 * The yellow selection ring is drawn by GraphCanvas.
 */

export const NODE_STYLES = {
  CLASSIC: "classic",
  CARD: "card",
  SIMPLE: "simple",
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const parseColor = (c) => {
  if (!c) return { r: 255, g: 255, b: 255, a: 1 };
  if (c.startsWith("#")) {
    const hex = c.slice(1);
    const full = hex.length === 3 ? hex.split("").map((h) => h + h).join("") : hex;
    const n = parseInt(full, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const m = c.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(",").map((s) => s.trim());
    const r = parseFloat(p[0]), g = parseFloat(p[1]), b = parseFloat(p[2]);
    const a = p[3] != null ? parseFloat(p[3]) : 1;
    return { r, g, b, a: isNaN(a) ? 1 : a };
  }
  return { r, g, b, a: 1 };
};
const toRgba = ({ r, g, b, a }) =>
  `rgba(${clamp(Math.round(r), 0, 255)},${clamp(Math.round(g), 0, 255)},${clamp(
    Math.round(b),
    0,
    255
  )},${clamp(a, 0, 1)})`;

const mix = (c, t, amt) => ({
  r: c.r + (t.r - c.r) * amt,
  g: c.g + (t.g - c.g) * amt,
  b: c.b + (t.b - c.b) * amt,
  a: c.a + (t.a - c.a) * amt,
});
const lighten = (c, amt) => mix(c, { r: 255, g: 255, b: 255, a: c.a }, amt);
const darken = (c, amt) => mix(c, { r: 0, g: 0, b: 0, a: c.a }, amt);

function colorForTreeNode(node, STYLE) {
  const isFunctionNode = /\bFunction\b/i.test(String(node?.name || ""));
  return isFunctionNode ? STYLE.nodeFillColor : node.__color || "#E879F9";
}

/** OPAQUE blocker circle to cover lines under the node */
function blockerCircle(ctx, x, y, r, canvasBg) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI, false);
  ctx.fillStyle = canvasBg;
  ctx.fill();
  ctx.restore();
}

/** OPAQUE blocker rounded-rect to cover lines under the card */
function blockerRoundRect(ctx, x, y, w, h, r, canvasBg) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = canvasBg;
  ctx.fill();
  ctx.restore();
}

/** Classic glossy sphere + label below */
function drawClassic(node, ctx, globalScale, env) {
  const { STYLE, IFSTYLE, LABELS, ui, approxRadius, pulseAlphaRef, ZOOM_SIZE_DAMPING, canvasBg } =
    env;
  if (!(node.__isTree || ui.showInterface)) return;

  const denom = Math.max(globalScale / ZOOM_SIZE_DAMPING, STYLE.minZoomFontScale);
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const r = approxRadius(node) / denom;
  if (r <= 0) return;

  blockerCircle(ctx, x, y, r * 1.1, canvasBg);

  let fill = IFSTYLE.nodeFill;
  if (node.__isTree) {
    if (node.__placeholder) {
      const a = pulseAlphaRef.current;
      fill = `rgba(209,213,219,${a.toFixed(3)})`;
    } else {
      fill = colorForTreeNode(node, STYLE);
    }
  }
  const base = parseColor(fill);

  const grad = ctx.createRadialGradient(x, y, r * 0.05, x, y, r * 0.98);
  grad.addColorStop(0.0, toRgba(lighten(base, 0.6)));
  grad.addColorStop(0.35, toRgba(lighten(base, 0.3)));
  grad.addColorStop(0.7, toRgba(base));
  grad.addColorStop(1.0, toRgba(darken(base, 0.35)));

  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI, false);
  if (!node.__isTree && ui.blurInterface) {
    ctx.save();
    ctx.filter = `blur(${ui.blurAmount}px)`;
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  } else {
    ctx.fillStyle = grad;
    ctx.fill();
  }

  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = Math.max(1, r * 0.18);
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.86, 0, 2 * Math.PI, false);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.98, 0, 2 * Math.PI, false);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = Math.max(1, r * 0.36);
  ctx.strokeStyle = "white";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.78, (-150 * Math.PI) / 180, (-20 * Math.PI) / 180, false);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.32, r * 0.18, 0, 2 * Math.PI, false);
  ctx.fillStyle = "white";
  ctx.fill();
  ctx.restore();

  if (!env.ui.labelsVisible) return;
  if (!node.__isTree && env.ui.blurInterface) return;

  const showPlaceholder = node.__placeholder && !!node.__placeholderName;
  const showReal = !node.__placeholder && !!node.name;
  if (!showPlaceholder && !showReal) return;

  const label = showPlaceholder ? node.__placeholderName : node.name;
  const px = STYLE.labelPx / denom;
  const gap = LABELS.gapPx / denom;
  const pad = LABELS.bckgPaddingPx / denom;
  const lx = x;
  const ly = y + r + gap;

  ctx.font = `${px}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  if (LABELS.background) {
    const w = ctx.measureText(label).width;
    const h = px;
    ctx.fillStyle = canvasBg;
    ctx.fillRect(lx - w / 2 - pad, ly - pad, w + pad * 2, h + pad * 2);
  }
  ctx.fillStyle = node.__isTree ? STYLE.labelColor : IFSTYLE.labelColor;
  ctx.fillText(label, lx, ly);
}

/** Card renderer: rounded card sized to text; label inside; no extra label below.
 *  Interface nodes get a gray border.
 */
function drawCard(node, ctx, globalScale, env) {
  const { STYLE, ui, ZOOM_SIZE_DAMPING, canvasBg } = env;
  if (!(node.__isTree || ui.showInterface)) return;

  const denom = Math.max(globalScale / ZOOM_SIZE_DAMPING, STYLE.minZoomFontScale);
  const x = node.x ?? 0;
  const y = node.y ?? 0;

  // text & sizing
  const px = (STYLE.labelPx * 0.95) / denom;
  const padX = 12 / denom;
  const padY = 6 / denom;
  const radius = 10 / denom;

  const label =
    node.__placeholder && node.__placeholderName ? node.__placeholderName : node.name || "";
  ctx.font = `${px}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  const textW = Math.max(24 / denom, ctx.measureText(label).width);
  const w = textW + padX * 2;
  const h = px + padY * 2;

  // opaque blocker under the card
  blockerRoundRect(ctx, x - w / 2, y - h / 2, w, h, radius, canvasBg);

  // body + border
  ctx.save();
  const isInterface = !node.__isTree;
  const baseColor = colorForTreeNode(node, STYLE);
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.strokeStyle = isInterface ? "#94A3B8" : baseColor; // gray border for interface
  ctx.lineWidth = Math.max(1, 1.2 / denom);

  roundRect(ctx, x - w / 2, y - h / 2, w, h, radius);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // label INSIDE — respect labelsVisible toggle
  if (!ui.labelsVisible) return;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y);
}

/** Simple semi-transparent-looking circle with thin border + label below. */
function drawSimple(node, ctx, globalScale, env) {
  const { STYLE, IFSTYLE, LABELS, ui, approxRadius, ZOOM_SIZE_DAMPING, canvasBg } = env;
  if (!(node.__isTree || ui.showInterface)) return;

  const denom = Math.max(globalScale / ZOOM_SIZE_DAMPING, STYLE.minZoomFontScale);
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const r = approxRadius(node) / denom;
  if (r <= 0) return;

  blockerCircle(ctx, x, y, r * 1.05, canvasBg);

  const stroke = node.__isTree ? colorForTreeNode(node, STYLE) : IFSTYLE.nodeFill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI, false);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.strokeStyle = toRgba({ ...parseColor(stroke), a: 0.9 });
  ctx.stroke();

  if (!env.ui.labelsVisible) return;
  if (!node.__isTree && env.ui.blurInterface) return;

  const showPlaceholder = node.__placeholder && !!node.__placeholderName;
  const showReal = !node.__placeholder && !!node.name;
  if (!showPlaceholder && !showReal) return;

  const label = showPlaceholder ? node.__placeholderName : node.name;
  const px = STYLE.labelPx / denom;
  const gap = LABELS.gapPx / denom;
  const pad = LABELS.bckgPaddingPx / denom;
  const lx = x;
  const ly = y + r + gap;

  ctx.font = `${px}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  if (LABELS.background) {
    const w = ctx.measureText(label).width;
    const h = px;
    ctx.fillStyle = canvasBg;
    ctx.fillRect(lx - w / 2 - pad, ly - pad, w + pad * 2, h + pad * 2);
  }
  ctx.fillStyle = node.__isTree ? STYLE.labelColor : IFSTYLE.labelColor;
  ctx.fillText(label, lx, ly);
}

/** helper: draw rounded rect */
function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, Math.min(w, h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

export function getNodeRenderer(styleKey, env) {
  const e = { ...env, canvasBg: env.canvasBg || "#111827" };
  switch ((styleKey || NODE_STYLES.CLASSIC).toLowerCase()) {
    case NODE_STYLES.CARD:
    case "card":
      return (node, ctx, globalScale) => drawCard(node, ctx, globalScale, e);
    case NODE_STYLES.SIMPLE:
    case "simple":
      return (node, ctx, globalScale) => drawSimple(node, ctx, globalScale, e);
    case NODE_STYLES.CLASSIC:
    case "classic":
    default:
      return (node, ctx, globalScale) => drawClassic(node, ctx, globalScale, e);
  }
}
