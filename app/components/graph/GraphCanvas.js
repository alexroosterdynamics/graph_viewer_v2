"use client";

import React from "react";
import { ForceGraph2D } from "./controller";

export default function GraphCanvas({ ctrl }) {
  const {
    fgRef,
    graph,
    curvedLinks,
    cooldownTicks,
    handleEngineStop,

    // render helpers & constants
    nodeVisibility,
    linkVisibility,
    approxRadius,
    arrowRelPos,
    ZOOM_SIZE_DAMPING,
    POINTER_HIT_SCALE,
    STYLE,
    IFSTYLE,
    LABELS,
    arrowStyle,

    // perf (pulse / selection)
    pulseAlphaRef,
    pulseTRef,

    // interactions
    handleNodeClick,
    handleLinkClick,
    handleBackgroundClick,

    // right menu selection
    rightOpen,
    rightKind,
    rightData,

    // UI flags
    ui,
  } = ctrl;

  const YELLOW = (a = 1) => `rgba(255,200,0,${a})`;

  const linkIsSelected = (l) => {
    if (!rightOpen || rightKind !== "link" || !rightData) return false;
    const sid = typeof l.source === "object" ? l.source.id : l.source;
    const tid = typeof l.target === "object" ? l.target.id : l.target;
    const s2 = typeof rightData.source === "object" ? rightData.source.id : rightData.source;
    const t2 = typeof rightData.target === "object" ? rightData.target.id : rightData.target;
    return sid === s2 && tid === t2 && (l.relation || "child_of") === (rightData.relation || "child_of");
  };

  return (
    <ForceGraph2D
      ref={fgRef}
      graphData={{ nodes: graph.nodes, links: curvedLinks }}
      cooldownTicks={cooldownTicks}
      onEngineStop={handleEngineStop}
      nodeLabel={(n) =>
        n.__placeholder && n.__placeholderName ? n.__placeholderName : `${n.id}: ${n.name ?? ""}`
      }

      /* ------- LINK STYLE (colors / width / arrows) ------- */
      linkColor={(l) => {
        // not used when we "replace" draw, but safe fallback
        if (linkIsSelected(l)) return YELLOW(0.95);
        if (l.__placeholder) return `rgba(209,213,219,${pulseAlphaRef.current.toFixed(3)})`;
        return l.relation === "interface" ? arrowStyle.colorInterface : STYLE.linkColor;
      }}
      linkWidth={(l) => {
        // selected links are fully custom-drawn (replace), width here is irrelevant
        if (l.__placeholder)
          return (IFSTYLE.linkWidth + STYLE.linkWidth) / 2;
        return l.relation === "interface" ? IFSTYLE.linkWidth : STYLE.linkWidth;
      }}
      linkCurvature={(l) => l.__curv || 0}
      linkDirectionalArrowLength={(l) =>
        ui.blurInterface && l.relation === "interface" ? 0 : arrowStyle.length
      }
      linkDirectionalArrowRelPos={arrowRelPos}
      linkDirectionalArrowColor={(l) =>
        linkIsSelected(l)
          ? YELLOW(0.95)
          : l.__placeholder
          ? `rgba(209,213,219,${pulseAlphaRef.current.toFixed(3)})`
          : l.relation === "interface"
          ? arrowStyle.colorInterface
          : arrowStyle.colorChild
      }
      linkDirectionalArrowResolution={arrowStyle.resolution}

      onLinkClick={handleLinkClick}

      /* ------- CUSTOM LINK DRAW (replace when selected or blurred interface) ------- */
      linkCanvasObject={(l, ctx) => {
        const s = l.source, t = l.target;
        if (!s || !t || typeof s !== "object" || typeof t !== "object") return;

        const sx = s.x ?? 0, sy = s.y ?? 0;
        const tx = t.x ?? 0, ty = t.y ?? 0;
        const dx = tx - sx, dy = ty - sy;
        const dist = Math.hypot(dx, dy) || 1;

        // quadratic control point from curvature
        const midx = (sx + tx) / 2;
        const midy = (sy + ty) / 2;
        const nx = -dy / dist;
        const ny = dx / dist;
        const curv = l.__curv || 0;
        const cpX = midx + nx * curv * dist;
        const cpY = midy + ny * curv * dist;

        const selected = linkIsSelected(l);

        // Draw selected link in yellow with a soft glow (single source of truth)
        if (selected) {
          const pulse =
            0.65 + 0.35 * (0.5 + 0.5 * Math.sin(pulseTRef.current * 2 * Math.PI * 1.2));
          const baseWidth = l.relation === "interface" ? IFSTYLE.linkWidth : STYLE.linkWidth;

          ctx.save();
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.shadowColor = YELLOW(0.7);
          ctx.shadowBlur = 14;
          ctx.strokeStyle = YELLOW(pulse);
          ctx.lineWidth = baseWidth * 2.2; // strong visible stroke
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.quadraticCurveTo(cpX, cpY, tx, ty);
          ctx.stroke();
          ctx.restore();

          return; // we "replace" the default drawing
        }

        // When interface blur is enabled, draw that here (and replace)
        if (ui.blurInterface && l.relation === "interface") {
          ctx.save();
          ctx.filter = `blur(${ui.blurAmount}px)`;
          ctx.lineWidth = IFSTYLE.linkWidth;
          ctx.strokeStyle = IFSTYLE.linkColor;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.quadraticCurveTo(cpX, cpY, tx, ty);
          ctx.stroke();
          ctx.restore();
        }
      }}
      linkCanvasObjectMode={(l) => {
        // REPLACE default drawing for:
        //  - selected relationships (yellow renderer)
        //  - blurred interface links (so they don't get double-drawn)
        if (linkIsSelected(l)) return "replace";
        if (ui.blurInterface && l.relation === "interface") return "replace";
        return undefined;
      }}

      /* ------- INTERACTION ------- */
      enableNodeDrag={ctrl.ui.draggable}
      onNodeDragStart={(node) => {
        if (node.static) node.__lock = { x: node.fx ?? node.x, y: node.fy ?? node.y };
      }}
      onNodeDrag={(node) => {
        if (node.static && node.__lock) {
          node.fx = node.__lock.x;
          node.fy = node.__lock.y;
        }
      }}
      onNodeDragEnd={(node) => {
        if (node.static && node.__lock) {
          node.fx = node.__lock.x;
          node.fy = node.__lock.y;
          delete node.__lock;
        }
      }}
      onNodeClick={handleNodeClick}
      onBackgroundClick={handleBackgroundClick}

      /* ------- VISIBILITY / HIT AREAS ------- */
      nodeVisibility={nodeVisibility}
      linkVisibility={linkVisibility}
      nodePointerAreaPaint={(node, color, ctx, globalScale) => {
        if (!(node.__isTree || ctrl.ui.showInterface)) return;
        const denom = Math.max(globalScale / ZOOM_SIZE_DAMPING, STYLE.minZoomFontScale);
        const r = (ctrl.approxRadius(node) / denom) * POINTER_HIT_SCALE;
        ctx.beginPath();
        ctx.arc(node.x, node.y, Math.max(1, r), 0, 2 * Math.PI, false);
        ctx.fillStyle = color;
        ctx.fill();
      }}

      /* ------- NODE DRAWING (unchanged except yellow ring when node selected) ------- */
      nodeCanvasObject={(node, ctx, globalScale) => {
        if (!(node.__isTree || ctrl.ui.showInterface)) return;

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
          return { r: 255, g: 255, b: 255, a: 1 };
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

        const denom = Math.max(globalScale / ZOOM_SIZE_DAMPING, STYLE.minZoomFontScale);
        const x = node.x ?? 0;
        const y = node.y ?? 0;
        const r = ctrl.approxRadius(node) / denom;
        if (r <= 0) return;

        let fill = IFSTYLE.nodeFill;
        if (node.__isTree) {
          if (node.__placeholder) {
            const a = pulseAlphaRef.current;
            fill = `rgba(209,213,219,${a.toFixed(3)})`;
          } else {
            fill = /\bFunction\b/i.test(String(node?.name || "")) ? STYLE.nodeFillColor : node.__color || "#E879F9";
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
        if (!node.__isTree && ctrl.ui.blurInterface) {
          ctx.save();
          ctx.filter = `blur(${ctrl.ui.blurAmount}px)`;
          ctx.fillStyle = grad;
          ctx.fill();
          ctx.restore();
        } else {
          ctx.fillStyle = grad;
          ctx.fill();
        }

        // glossy highlights
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

        // yellow ring when the RightMenu has this node selected
        if (rightOpen && rightKind === "node" && rightData?.id === node.id) {
          const t = pulseTRef.current;
          const pulse = (Math.sin(t * 2 * Math.PI * 1.2) + 1) / 2;
          const ringR = r * (1.25 + pulse * 0.25);
          ctx.save();
          ctx.lineWidth = Math.max(1.5, r * 0.12);
          ctx.strokeStyle = YELLOW(0.6 + 0.4 * pulse);
          ctx.beginPath();
          ctx.arc(x, y, ringR, 0, 2 * Math.PI, false);
          ctx.stroke();
          ctx.restore();
        }

        // labels
        if (!ctrl.ui.labelsVisible) return;
        if (!node.__isTree && ctrl.ui.blurInterface) return;

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
          ctx.fillStyle = "rgba(17,24,39,0.32)";
          ctx.fillRect(lx - w / 2 - pad, ly - pad, w + pad * 2, h + pad * 2);
        }
        ctx.fillStyle = node.__isTree ? STYLE.labelColor : IFSTYLE.labelColor;
        ctx.fillText(label, lx, ly);
      }}
      nodeCanvasObjectMode={() => "replace"}
    />
  );
}
