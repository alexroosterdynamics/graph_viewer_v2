"use client";

import React, { useMemo } from "react";
import { ForceGraph2D } from "./controller";
import { getNodeRenderer, NODE_STYLES } from "./renderers/nodeRenderers";

export default function GraphCanvas({ ctrl, nodeStyle = NODE_STYLES.CARD }) {
  const {
    fgRef,
    graph,
    curvedLinks,
    cooldownTicks,
    handleEngineStop,

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

    pulseAlphaRef,
    pulseTRef,

    handleNodeClick,
    handleLinkClick,
    handleBackgroundClick,

    rightOpen,
    rightKind,
    rightData,

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

  // Tailwind bg-gray-900 used on the container: #111827
  const canvasBg = "#111827";

  const nodeRenderer = useMemo(
    () =>
      getNodeRenderer(nodeStyle, {
        STYLE,
        IFSTYLE,
        LABELS,
        ui,
        approxRadius,
        pulseAlphaRef,
        ZOOM_SIZE_DAMPING,
        canvasBg, // <-- ensures the opaque blocker matches the page bg
      }),
    [
      nodeStyle,
      STYLE,
      IFSTYLE,
      LABELS,
      ui,
      approxRadius,
      pulseAlphaRef,
      ZOOM_SIZE_DAMPING,
      canvasBg,
    ]
  );

  return (
    <ForceGraph2D
      ref={fgRef}
      graphData={{ nodes: graph.nodes, links: curvedLinks }}
      cooldownTicks={cooldownTicks}
      onEngineStop={handleEngineStop}
      nodeLabel={(n) =>
        n.__placeholder && n.__placeholderName ? n.__placeholderName : `${n.id}: ${n.name ?? ""}`
      }

      linkColor={(l) => {
        if (linkIsSelected(l)) return YELLOW(0.95);
        if (l.__placeholder) return `rgba(209,213,219,${pulseAlphaRef.current.toFixed(3)})`;
        return l.relation === "interface" ? arrowStyle.colorInterface : STYLE.linkColor;
      }}
      linkWidth={(l) => {
        if (l.__placeholder) return (IFSTYLE.linkWidth + STYLE.linkWidth) / 2;
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

      linkCanvasObject={(l, ctx) => {
        const s = l.source, t = l.target;
        if (!s || !t || typeof s !== "object" || typeof t !== "object") return;

        const sx = s.x ?? 0, sy = s.y ?? 0;
        const tx = t.x ?? 0, ty = t.y ?? 0;
        const dx = tx - sx, dy = ty - sy;
        const dist = Math.hypot(dx, dy) || 1;

        const midx = (sx + tx) / 2;
        const midy = (sy + ty) / 2;
        const nx = -dy / dist;
        const ny = dx / dist;
        const curv = l.__curv || 0;
        const cpX = midx + nx * curv * dist;
        const cpY = midy + ny * curv * dist;

        const selected = linkIsSelected(l);

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
          ctx.lineWidth = baseWidth * 2.2;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.quadraticCurveTo(cpX, cpY, tx, ty);
          ctx.stroke();
          ctx.restore();

          return; // replace
        }

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
        if (linkIsSelected(l)) return "replace";
        if (ui.blurInterface && l.relation === "interface") return "replace";
        return undefined;
      }}

      enableNodeDrag={ui.draggable}
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

      nodeVisibility={nodeVisibility}
      linkVisibility={linkVisibility}
      nodePointerAreaPaint={(node, color, ctx, globalScale) => {
        if (!(node.__isTree || ui.showInterface)) return;
        const denom = Math.max(globalScale / ZOOM_SIZE_DAMPING, STYLE.minZoomFontScale);
        const r = (approxRadius(node) / denom) * POINTER_HIT_SCALE;
        ctx.beginPath();
        ctx.arc(node.x, node.y, Math.max(1, r), 0, 2 * Math.PI, false);
        ctx.fillStyle = color;
        ctx.fill();
      }}

      nodeCanvasObject={(node, ctx, globalScale) => {
        // style-specific renderer (includes opaque blocker)
        nodeRenderer(node, ctx, globalScale);

        // yellow selection ring (kept intact for all styles)
        if (rightOpen && rightKind === "node" && rightData?.id === node.id) {
          const denom = Math.max(globalScale / ZOOM_SIZE_DAMPING, STYLE.minZoomFontScale);
          const x = node.x ?? 0;
          const y = node.y ?? 0;

          if ((nodeStyle || "").toLowerCase() === "card") {
            // approximate card bounds from label (mirror renderer math)
            const label =
              node.__placeholder && node.__placeholderName
                ? node.__placeholderName
                : node.name || "";
            const px = (STYLE.labelPx * 0.95) / denom;
            const padX = 12 / denom;
            const padY = 6 / denom;
            const radius = 10 / denom;

            ctx.save();
            ctx.font = `${px}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
            const textW = Math.max(24 / denom, ctx.measureText(label).width);
            const w = textW + padX * 2;
            const h = px + padY * 2;

            const t = (Math.sin(pulseTRef.current * 2 * Math.PI * 1.2) + 1) / 2;
            ctx.lineWidth = Math.max(1.5, 1.8 / denom);
            ctx.strokeStyle = YELLOW(0.6 + 0.4 * t);
            roundRect(
              ctx,
              x - w / 2 - 6 / denom,
              y - h / 2 - 4 / denom,
              w + 12 / denom,
              h + 8 / denom,
              radius + 6 / denom
            );
            ctx.stroke();
            ctx.restore();
          } else {
            const r = (approxRadius(node) / denom) * 1.35;
            const t = (Math.sin(pulseTRef.current * 2 * Math.PI * 1.2) + 1) / 2;
            ctx.save();
            ctx.lineWidth = Math.max(1.5, r * 0.12);
            ctx.strokeStyle = YELLOW(0.6 + 0.4 * t);
            ctx.beginPath();
            ctx.arc(x, y, r, 0, 2 * Math.PI, false);
            ctx.stroke();
            ctx.restore();
          }
        }
      }}
      nodeCanvasObjectMode={() => "replace"}
    />
  );
}

/* helper for ring path around card */
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
