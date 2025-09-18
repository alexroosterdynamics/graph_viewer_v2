// app/page.js
"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import rawGraph from "./initialGraph.json";
import {
  TIMING,
  FORCE,
  STYLE,
  IFSTYLE,
  IFPLACEMENT,
  LABELS,
  VIEW,
  LOCAL,
  LOCAL_SCALING,
  FLAGS,
  BLUR,
  BACKGROUND,
  arrowStyle,
} from "./constants";
import { buildBase, getBiLocalCore, getForestCore } from "./lib/base";
import { applyCurvatures } from "./lib/geometry";
import {
  ticksFromMs,
  seedInterfacePositions,
  configureForces,
} from "./lib/sim";
import Widget from "./components/widget";
import Background from "./components/Background";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

export default function Page() {
  const fgRef = useRef(null);

  // Scene phases: "settleTree" => (engine stops) => "withInterface"
  const [phase, setPhase] = useState("settleTree");
  const [cooldownTicks, setCooldownTicks] = useState(
    ticksFromMs(TIMING.settleTreeMs)
  );
  const transitionedRef = useRef(false);

  // Current view's root: null = GLOBAL forest; non-null = local root id
  const currentRootRef = useRef(null);

  // Depth map for current LOCAL view (nodeId -> depth from focused). Null in global.
  const depthMapRef = useRef(null);

  // UI state (widget)
  const [ui, setUi] = useState({
    draggable: FLAGS.draggable,
    showInterface: FLAGS.showInterface,
    blurInterface: FLAGS.blurInterface,
    blurAmount: BLUR.amountPx,
    visibleDepth: LOCAL.visibleDepth,
    labelsVisible: true,
  });

  // Base graph (split relations, maps, function roots & colors)
  const base = useMemo(() => buildBase(rawGraph), []);
  const initialCore = useMemo(
    () => getForestCore(base, base.functionRoots),
    [base]
  );

  // severity legend for widget (from Functions)
  const legend = useMemo(() => {
    const isFunction = (n) => /\bFunction\b/i.test(String(n.name || ""));
    return base.nodes.filter(isFunction).map((fn) => ({
      name: fn.name,
      severity: typeof fn.severity === "number" ? fn.severity : null,
      color: base.colorById.get(fn.id) || "#E879F9",
      items: Array.isArray(fn.components) ? fn.components.slice(0, 24) : [],
    }));
  }, [base]);

  // Graph fed to ForceGraph
  const [graph, setGraph] = useState(() => ({
    nodes: initialCore.nodes.map((n) => ({
      ...n,
      static: false,
      __isTree: true,
      __color: base.colorById.get(n.id) || STYLE.nodeFillColor,
    })),
    links: initialCore.links.map((l) => ({ ...l })),
  }));

  // Track the live D3 nodes array (mutated by the sim)
  const nodesRef = useRef(graph.nodes);
  useEffect(() => {
    nodesRef.current = graph.nodes;
  }, [graph.nodes]);

  // Snapshot of the FIRST global freeze to restore later (no rotation)
  const globalSnapshotRef = useRef(null);

  // Helper: pick severity color for tree nodes
  // REPLACE your existing colorForTreeNode with:
  const colorForTreeNode = (node) => {
    if (isFunctionNode(node)) return STYLE.nodeFillColor; // cool cyan #21B2F0
    return node.__color || "#E879F9"; // fuchsia ramp for others
  };

  // Phase-1 boost & collision tuning
  const FORCE_TUNING = {
    collideRadius: 18,
    collideStrength: 1.0,
    boostFactor: 1.8,
  };

  /* ------------------ helpers ------------------ */

  const ROOT_BASE_SCALE = 1.35; // tweak size boost for Function roots

  const isFunctionNode = (n) => /\bFunction\b/i.test(String(n?.name || ""));

  const fitNow = () => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.zoomToFit(TIMING.fitDurationMs, VIEW.fitPadding);
    setTimeout(
      () => fg.centerAt(0, 0, TIMING.fitDurationMs / 2),
      TIMING.fitDurationMs
    );
  };

  // Tiny pulse that toggles draggable ON then back OFF after ~120ms
  const pulseDragToggle = () => {
    setUi((prev) => {
      const original = prev.draggable;
      const flipped = !original;
      const next = { ...prev, draggable: flipped };
      setTimeout(() => {
        setUi((after) => ({ ...after, draggable: original }));
      }, 120);
      return next;
    });
  };

  // Fast triple toggle during settleTree to nudge sim
  const pulseDragJitter = (times = 3, intervalMs = 70) => {
    const initial = ui.draggable;
    let flips = 0;
    const tick = () => {
      setUi((prev) => ({ ...prev, draggable: !prev.draggable }));
      flips += 1;
      if (flips < times * 2) {
        setTimeout(tick, intervalMs);
      } else {
        // ensure we end back on the initial state
        setTimeout(() => {
          setUi((prev) => ({ ...prev, draggable: initial }));
        }, intervalMs);
      }
    };
    tick();
  };

  const kickInterfaceSim = () => {
    const fg = fgRef.current;
    if (!fg) return;

    configureForces(fg, "withInterface", FORCE, FORCE_TUNING);

    const gd =
      typeof fg.graphData === "function" ? fg.graphData() : fg.graphData;
    const nodes = gd?.nodes || [];
    nodes.forEach((n) => {
      if (!n.__isTree) {
        delete n.fx;
        delete n.fy;
        n.vx = (Math.random() - 0.5) * 1.5;
        n.vy = (Math.random() - 0.5) * 1.5;
      }
    });

    setCooldownTicks(ticksFromMs(TIMING.settleTreeMs));
    fg.d3ReheatSimulation?.();
  };

  // Start a scene (global forest when rootId=null; local otherwise)
  const startScene = (rootId, depthOverride = null) => {
    currentRootRef.current = rootId;
    transitionedRef.current = false;

    // If returning to Global and we have a snapshot, restore it exactly
    if (rootId == null && globalSnapshotRef.current) {
      depthMapRef.current = null;
      const snap = globalSnapshotRef.current;
      const treeSet = new Set(snap.nodes.map((n) => n.id));
      const ifaceLinksScoped = base.interfaceLinks; // global: all interface links
      const ifaceNodeIds = new Set();
      for (const l of ifaceLinksScoped) {
        ifaceNodeIds.add(l.source);
        ifaceNodeIds.add(l.target);
      }
      const finalNodeIds = new Set([...treeSet, ...ifaceNodeIds]);

      const allNodes = base.nodes
        .filter((n) => finalNodeIds.has(n.id))
        .map((n) => {
          const frozen = snap.byId.get(n.id);
          if (frozen) {
            return {
              ...n,
              x: frozen.x,
              y: frozen.y,
              fx: frozen.fx,
              fy: frozen.fy,
              static: true,
              __isTree: true,
              __color: base.colorById.get(n.id) || STYLE.nodeFillColor,
            };
          }
          return {
            ...n,
            static: false,
            __isTree: false, // interface-only nodes in global phase
            __color: base.colorById.get(n.id) || STYLE.nodeFillColor,
          };
        });

      seedInterfacePositions(base, allNodes, treeSet, IFPLACEMENT);
      const allLinks = [
        ...base.childLinks.filter(
          (l) => treeSet.has(l.source) && treeSet.has(l.target)
        ),
        ...ifaceLinksScoped,
      ].map((l) => ({ ...l }));

      setPhase("withInterface");
      setCooldownTicks(ticksFromMs(TIMING.settleTreeMs));
      setGraph({ nodes: allNodes, links: allLinks });

      requestAnimationFrame(() => {
        kickInterfaceSim();
        pulseDragToggle();
        fitNow();
      });
      return;
    }

    // Otherwise run the 2-phase flow
    setPhase("settleTree");
    setCooldownTicks(ticksFromMs(TIMING.settleTreeMs));

    const maxDepth = rootId == null ? null : depthOverride ?? ui.visibleDepth;
    const core =
      rootId == null
        ? getForestCore(base, base.functionRoots)
        : getBiLocalCore(base, rootId, maxDepth); // bi-directional local core

    // store descendants depth map (for scaling)
    depthMapRef.current = rootId == null ? null : core.depthById;

    // Reset positions so linkDistance/charge can actively reshape layout
    core.nodes.forEach((n) => {
      delete n.fx;
      delete n.fy;
      n.x = (Math.random() - 0.5) * 10;
      n.y = (Math.random() - 0.5) * 10;
      n.vx = 0;
      n.vy = 0;
    });

    setGraph({
      nodes: core.nodes.map((n) => ({
        ...n,
        static: false,
        __isTree: true,
        __color: base.colorById.get(n.id) || STYLE.nodeFillColor,
      })),
      links: core.links.map((l) => ({ ...l })),
    });
  };

  const startLocal = (id, depthOverride = null) =>
    startScene(id, depthOverride);
  const startGlobal = () => startScene(null);

  // Re-apply forces & duration whenever constants or phase/data change
  useEffect(() => {
    configureForces(fgRef.current, phase, FORCE, FORCE_TUNING);
    setCooldownTicks(ticksFromMs(TIMING.settleTreeMs));
  }, [
    phase,
    graph.nodes?.length,
    graph.links?.length,
    TIMING.settleTreeMs,
    FORCE.tree.linkDistance,
    FORCE.tree.linkStrength,
    FORCE.tree.charge,
    FORCE.interface.linkDistance,
    FORCE.interface.linkStrength,
    FORCE.interface.charge,
  ]);

  // Nudge the sim at the start of phase 1 (quick triple toggle)
  useEffect(() => {
    if (phase === "settleTree") {
      pulseDragJitter(3, 70);
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------ engine stop = phase switch ------------------ */

  const handleEngineStop = () => {
    const fg = fgRef.current;
    if (!fg) return;

    if (phase === "settleTree" && !transitionedRef.current) {
      transitionedRef.current = true;

      // Freeze current tree positions
      const fixed = new Map();
      for (const n of nodesRef.current) {
        if (!n.__isTree) continue;
        fixed.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
      }
      const treeSet = new Set(fixed.keys());

      // If this was the FIRST global settle, persist a snapshot
      if (currentRootRef.current == null && !globalSnapshotRef.current) {
        const nodesSnap = [...nodesRef.current]
          .filter((n) => n.__isTree)
          .map((n) => ({
            id: n.id,
            x: n.x,
            y: n.y,
            fx: n.x,
            fy: n.y,
            static: true,
          }));
        globalSnapshotRef.current = {
          nodes: nodesSnap,
          byId: new Map(nodesSnap.map((n) => [n.id, n])),
        };
      }

      // Decide scope for interface links:
      const isGlobal = currentRootRef.current == null;
      const ifaceLinksScoped = isGlobal
        ? base.interfaceLinks
        : base.interfaceLinks.filter(
            (l) => treeSet.has(l.source) || treeSet.has(l.target)
          );

      // Final node ids = tree nodes + endpoints of scoped interface links
      const ifaceNodeIds = new Set();
      for (const l of ifaceLinksScoped) {
        ifaceNodeIds.add(l.source);
        ifaceNodeIds.add(l.target);
      }
      const finalNodeIds = new Set([...treeSet, ...ifaceNodeIds]);

      // Build node array (tree fixed, interface free)
      const allNodes = base.nodes
        .filter((n) => finalNodeIds.has(n.id))
        .map((n) => {
          if (treeSet.has(n.id)) {
            const p = fixed.get(n.id);
            return {
              ...n,
              x: p.x,
              y: p.y,
              fx: p.x,
              fy: p.y,
              static: true,
              __isTree: true,
              __color: base.colorById.get(n.id) || STYLE.nodeFillColor,
            };
          }
          return {
            ...n,
            static: false,
            __isTree: false, // interface-only for phase 2
            __color: base.colorById.get(n.id) || STYLE.nodeFillColor,
          };
        });

      // Seed interface-only nodes near anchors
      seedInterfacePositions(base, allNodes, treeSet, IFPLACEMENT);

      // Combine links: tree links inside treeSet + scoped interface links
      const treeLinksScoped = base.childLinks.filter(
        (l) => treeSet.has(l.source) && treeSet.has(l.target)
      );
      const allLinks = [...treeLinksScoped, ...ifaceLinksScoped].map((l) => ({
        ...l,
      }));

      // Switch to phase 2
      setGraph({ nodes: allNodes, links: allLinks });
      setPhase("withInterface");
      setCooldownTicks(ticksFromMs(TIMING.settleTreeMs));

      requestAnimationFrame(() => {
        kickInterfaceSim();
        pulseDragToggle();
        fitNow();
      });
    }
  };

  /* ------------------ UI events ------------------ */

  const handleDepthChange = (e) => {
    const v = Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 1));
    setUi((u) => ({ ...u, visibleDepth: v }));
    if (currentRootRef.current != null) startLocal(currentRootRef.current, v);
  };

  /* ------------------ render helpers ------------------ */

  const nodeVisibility = (n) => n.__isTree || ui.showInterface;
  const linkVisibility = (l) =>
    l.relation === "child_of" ? true : !ui.blurInterface && ui.showInterface;

  // app/page.js — REPLACE your approxRadius with this version
  const approxRadius = (node) => {
    const isLocal = currentRootRef.current != null;
    const isCurrentRoot = node.__isTree && node.id === currentRootRef.current;

    let scale = node.scale ?? 1;

    // interface nodes slightly smaller
    if (!node.__isTree) scale *= IFSTYLE.nodeScaleMul;

    // boost all Function (root) nodes
    if (node.__isTree && isFunctionNode(node)) {
      scale *= ROOT_BASE_SCALE;
    }

    // local-view scaling (focused root larger, descendants decay by depth)
    if (node.__isTree && isLocal) {
      if (isCurrentRoot) {
        scale *= LOCAL_SCALING.rootScaleMul;
      } else if (depthMapRef.current) {
        const d = depthMapRef.current.get(node.id);
        if (typeof d === "number" && d > 0) {
          scale *= Math.pow(LOCAL_SCALING.childDecay, d);
        }
      }
    }

    return STYLE.nodeRadiusPx * scale;
  };

  const arrowRelPos = (link) => {
    const s = link.source,
      t = link.target;
    if (!s || !t || typeof s !== "object" || typeof t !== "object") return 0.95;
    const dx = (t.x ?? 0) - (s.x ?? 0);
    const dy = (t.y ?? 0) - (s.y ?? 0);
    const len = Math.hypot(dx, dy) || 1;
    const tr = approxRadius(t) + (arrowStyle.relPosPadPx || 0);
    return Math.max(0.1, 1 - tr / len);
  };

  const curvedLinks = useMemo(
    () => applyCurvatures(graph.links.map((l) => ({ ...l }))),
    [graph.links]
  );

  const arrowLen = (l) =>
    ui.blurInterface && l.relation === "interface" ? 0 : arrowStyle.length;

  // Custom blurred drawing for interface links (when blur enabled)
  const linkCanvasObject = (link, ctx) => {
    if (!ui.blurInterface || link.relation !== "interface") return;

    const s = link.source,
      t = link.target;
    if (!s || !t || typeof s !== "object" || typeof t !== "object") return;

    const sx = s.x ?? 0,
      sy = s.y ?? 0;
    const tx = t.x ?? 0,
      ty = t.y ?? 0;
    const dx = tx - sx,
      dy = ty - sy;
    const dist = Math.hypot(dx, dy) || 1;

    const midx = (sx + tx) / 2;
    const midy = (sy + ty) / 2;
    const nx = -dy / dist;
    const ny = dx / dist;
    const curv = link.__curv || 0;
    const cpX = midx + nx * curv * dist;
    const cpY = midy + ny * curv * dist;

    ctx.save();
    ctx.filter = `blur(${ui.blurAmount}px)`;
    ctx.lineWidth = IFSTYLE.linkWidth;
    ctx.strokeStyle = IFSTYLE.linkColor; // controlled via constants
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cpX, cpY, tx, ty);
    ctx.stroke();
    ctx.restore();
  };

  const linkCanvasObjectMode = (link) =>
    ui.blurInterface && link.relation === "interface" ? "replace" : undefined;

  /* ------------------ render ------------------ */

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-gray-900 text-white">
      {BACKGROUND.use_custom_bg && <Background config={BACKGROUND} />}

      <Widget
        draggable={ui.draggable}
        showInterface={ui.showInterface}
        blurInterface={ui.blurInterface}
        blurAmount={ui.blurAmount}
        visibleDepth={ui.visibleDepth}
        labelsVisible={ui.labelsVisible}
        onToggleDrag={(e) =>
          setUi((u) => ({ ...u, draggable: e.target.checked }))
        }
        onToggleInterface={(e) =>
          setUi((u) => ({ ...u, showInterface: e.target.checked }))
        }
        onToggleBlur={(e) =>
          setUi((u) => ({ ...u, blurInterface: e.target.checked }))
        }
        onDepthChange={handleDepthChange}
        onBlurAmountChange={(e) =>
          setUi((u) => ({
            ...u,
            blurAmount: Math.max(
              0,
              Math.min(50, parseFloat(e.target.value) || 0)
            ),
          }))
        }
        onToggleLabels={(e) =>
          setUi((u) => ({ ...u, labelsVisible: e.target.checked }))
        }
        legend={legend}
      />

      <ForceGraph2D
        ref={fgRef}
        graphData={{ nodes: graph.nodes, links: curvedLinks }}
        // physics lifecycle
        cooldownTicks={cooldownTicks}
        onEngineStop={handleEngineStop}
        // tooltip
        nodeLabel={(n) => `${n.id}: ${n.name ?? ""}`}
        // colors & widths
        linkColor={(l) =>
          l.relation === "interface"
            ? arrowStyle.colorInterface
            : STYLE.linkColor
        }
        linkWidth={(l) =>
          l.relation === "interface" ? IFSTYLE.linkWidth : STYLE.linkWidth
        }
        // curves + arrows
        linkCurvature={(l) => l.__curv || 0}
        linkDirectionalArrowLength={(l) =>
          ui.blurInterface && l.relation === "interface" ? 0 : arrowLen(l)
        }
        linkDirectionalArrowRelPos={arrowRelPos}
        linkDirectionalArrowColor={(l) =>
          l.relation === "interface"
            ? arrowStyle.colorInterface
            : arrowStyle.colorChild
        }
        linkDirectionalArrowResolution={arrowStyle.resolution}
        // optional custom link render (blurred interface)
        linkCanvasObject={linkCanvasObject}
        linkCanvasObjectMode={linkCanvasObjectMode}
        // interaction
        enableNodeDrag={ui.draggable}
        onNodeDragStart={(node) => {
          if (node.static)
            node.__lock = { x: node.fx ?? node.x, y: node.fy ?? node.y };
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
        onNodeClick={(node) => startLocal(node.id)}
        onBackgroundClick={() => {
          if (currentRootRef.current != null) startGlobal(); // null === global
        }}
        // visibility toggles
        nodeVisibility={(n) => n.__isTree || ui.showInterface}
        linkVisibility={linkVisibility}
        // pointer hit area
        nodePointerAreaPaint={(node, color, ctx, globalScale) => {
          if (!(node.__isTree || ui.showInterface)) return;
          const r =
            approxRadius(node) / Math.max(globalScale, STYLE.minZoomFontScale);
          ctx.beginPath();
          ctx.arc(node.x, node.y, Math.max(1, r), 0, 2 * Math.PI, false);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        // draw nodes + labels (interface nodes stay gray; no outlines anywhere)
        nodeCanvasObject={(node, ctx, globalScale) => {
          if (!(node.__isTree || ui.showInterface)) return;

          const x = node.x ?? 0,
            y = node.y ?? 0;
          const r =
            approxRadius(node) / Math.max(globalScale, STYLE.minZoomFontScale);
          if (r <= 0) return;

          if (!node.__isTree) {
            // Interface node: always IFSTYLE.nodeFill (controlled in constants)
            if (ui.blurInterface) {
              ctx.save();
              ctx.filter = `blur(${ui.blurAmount}px)`;
              ctx.beginPath();
              ctx.arc(x, y, r, 0, 2 * Math.PI, false);
              ctx.fillStyle = IFSTYLE.nodeFill;
              ctx.fill();
              ctx.restore();
            } else {
              ctx.beginPath();
              ctx.arc(x, y, r, 0, 2 * Math.PI, false);
              ctx.fillStyle = IFSTYLE.nodeFill;
              ctx.fill();
            }
          } else {
            // Tree node: severity color (fuchsia ramp)
            ctx.beginPath();
            ctx.arc(x, y, r, 0, 2 * Math.PI, false);
            ctx.fillStyle = colorForTreeNode(node);
            ctx.fill();
          }

          // Labels: only if toggle ON; also hide for blurred interface nodes
          if (!ui.labelsVisible) return;
          if (!node.__isTree && ui.blurInterface) return;

          const label = `${node.id}: ${node.name ?? ""}`;
          const px =
            STYLE.labelPx / Math.max(globalScale, STYLE.minZoomFontScale);
          const gap =
            LABELS.gapPx / Math.max(globalScale, STYLE.minZoomFontScale);
          const pad =
            LABELS.bckgPaddingPx /
            Math.max(globalScale, STYLE.minZoomFontScale);
          const lx = x,
            ly = y + r + gap;

          ctx.font = `${px}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";

          if (LABELS.background) {
            const w = ctx.measureText(label).width;
            const h = px;
            ctx.fillStyle = LABELS.bckgFill;
            ctx.fillRect(lx - w / 2 - pad, ly - pad, w + pad * 2, h + pad * 2);
          }

          ctx.fillStyle = node.__isTree ? STYLE.labelColor : IFSTYLE.labelColor;
          ctx.fillText(label, lx, ly);
        }}
        nodeCanvasObjectMode={() => "replace"}
      />
    </div>
  );
}
