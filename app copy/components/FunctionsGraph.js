"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
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
} from "../constants";
import { buildBase, getBiLocalCore, getForestCore } from "../lib/base";
import { applyCurvatures } from "../lib/geometry";
import {
  ticksFromMs,
  seedInterfacePositions,
  configureForces,
} from "../lib/sim";
import Widget from "./widget";
import Background from "./Background";
import SelectionOverlay from "./SelectionOverlay";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

/* ======= Placeholder config (easy control) ======= */
const PLACEHOLDER = {
  count: 3,
  linkLen: 26, // short arms
  offsetsDeg: [-14, 0, 14], // distributed around outward direction
  nodeFill: "#D1D5DB", // gray-300 nodes
  linkColor: "#D1D5DB", // gray-300 links
  pulseMinA: 0.45,
  pulseMaxA: 0.95,
};

/* Dampen how much node sizes change with zoom (bigger = less size change) */
const ZOOM_SIZE_DAMPING = 3;
/* Scale the pointer hit area (smaller number => smaller pointer on zoom-in) */
const POINTER_HIT_SCALE = 0.4;

export default function FunctionsGraph({ data }) {
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
    blurInterface: BLUR.enabled ?? FLAGS.blurInterface,
    blurAmount: BLUR.amountPx,
    visibleDepth: LOCAL.visibleDepth,
    labelsVisible: true,
  });

  // Base graph (split relations, maps, function roots & colors)
  const base = useMemo(() => buildBase(data), [data]);
  const initialCore = useMemo(
    () => getForestCore(base, base.functionRoots),
    [base]
  );

  // severity legend for widget (from Functions)
  const legend = useMemo(() => {
    const isFunction = (n) => /\bFunction\b/i.test(String(n.name || ""));
    const fns = base.nodes.filter(isFunction);
    if (!fns.length) return [];
    return fns.map((fn) => ({
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

  // Selection / creation panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [panelAnchor, setPanelAnchor] = useState(null);
  const [optionMap, setOptionMap] = useState({}); // {"1": id, "2": id, "3": id}
  const [usedOptions, setUsedOptions] = useState(new Set()); // magenta chips in panel
  const [editingId, setEditingId] = useState(null);
  const inputRef = useRef(null);

  // pulse anim for placeholders (nodes + links)
  const pulseAlphaRef = useRef(PLACEHOLDER.pulseMaxA);
  useEffect(() => {
    let raf;
    const loop = () => {
      const t = performance.now() / 1000;
      const s = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 0.9); // ~0.9Hz
      pulseAlphaRef.current =
        PLACEHOLDER.pulseMinA +
        (PLACEHOLDER.pulseMaxA - PLACEHOLDER.pulseMinA) * s;
      fgRef.current?.refresh?.();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // temp id generator for placeholders
  const tempIdRef = useRef(-1);
  const nextTempId = () => {
    tempIdRef.current -= 1;
    return tempIdRef.current;
  };

  // Helper: detect Function nodes
  const isFunctionNode = (n) => /\bFunction\b/i.test(String(n?.name || ""));

  // Helper: pick fill color for tree nodes (Function nodes = cyan)
  const colorForTreeNode = (node) => {
    if (isFunctionNode(node)) return STYLE.nodeFillColor;
    return node.__color || "#E879F9"; // fuchsia ramp fallback
  };

  /* ------------------ helpers ------------------ */

  const ROOT_BASE_SCALE = 1.35; // function nodes a bit bigger

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
        setTimeout(() => {
          setUi((prev) => ({ ...prev, draggable: initial }));
        }, intervalMs);
      }
    };
    tick();
  };

  const configurePhaseForces = () => {
    configureForces(fgRef.current, phase, FORCE);
  };

  const kickInterfaceSim = () => {
    const fg = fgRef.current;
    if (!fg) return;

    configurePhaseForces();

    // free interface-only nodes so they can settle
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

  // screen coords helper for overlays
  const nodeScreenXY = (node) => {
    const fg = fgRef.current;
    if (!fg || !node) return null;
    const { x = 0, y = 0 } = node;
    const p = fg.graph2ScreenCoords?.(x, y);
    return p ? { x: p.x, y: p.y } : null;
  };

  // focus camera on node
  const focusNode = (node, { zoom = 2, ms = 600 } = {}) => {
    const fg = fgRef.current;
    if (!fg || !node) return;
    fg.centerAt(node.x ?? 0, node.y ?? 0, ms);
    fg.zoom(zoom, ms);
  };

  // angle(s) pointing outward to canvas "exterior"
  const outwardAnglesDeg = (node) => {
    // direction from origin -> node, so outward is same angle
    const theta = Math.atan2(node.y ?? 0, node.x ?? 0) * (180 / Math.PI);
    return PLACEHOLDER.offsetsDeg.map((o) => theta + o);
  };

  // build static, short placeholder nodes & links around an anchor
  const spawnStaticPlaceholders = (anchorNode) => {
    const angs = outwardAnglesDeg(anchorNode);
    const map = {};
    const newNodes = [];
    const newLinks = [];

    angs.slice(0, PLACEHOLDER.count).forEach((deg, idx) => {
      const id = nextTempId();
      map[String(idx + 1)] = id;

      const rad = (deg * Math.PI) / 180;
      const dx = Math.cos(rad) * PLACEHOLDER.linkLen;
      const dy = Math.sin(rad) * PLACEHOLDER.linkLen;

      const px = (anchorNode.x ?? 0) + dx;
      const py = (anchorNode.y ?? 0) + dy;

      newNodes.push({
        id,
        name: "", // will be typed later
        __placeholderName: `Node ${idx + 1}`, // show while placeholder
        scale: 0.9,
        __isTree: true, // treat as tree for visibility
        __placeholder: true,
        __color: PLACEHOLDER.nodeFill,
        x: px,
        y: py,
        fx: px, // static from the start (still draggable if user enables)
        fy: py,
        static: false,
      });

      newLinks.push({
        source: anchorNode.id,
        target: id,
        relation: "child_of",
        __placeholder: true, // style: light gray & pulsing
      });
    });

    return { nodes: newNodes, links: newLinks, map };
  };

  // remove all current placeholders
  const clearAllPlaceholders = () => {
    setGraph((g) => {
      const nodes = g.nodes.filter((n) => !n.__placeholder);
      const links = g.links.filter((l) => !l.__placeholder);
      return { nodes, links };
    });
    setOptionMap({});
    setUsedOptions(new Set());
  };

  /* ------------------ start scenes ------------------ */

  const startScene = (rootId, depthOverride = null) => {
    currentRootRef.current = rootId;
    transitionedRef.current = false;

    // If returning to Global and we have a snapshot, restore it exactly
    if (rootId == null && globalSnapshotRef.current) {
      depthMapRef.current = null;
      const snap = globalSnapshotRef.current;
      const treeSet = new Set(snap.nodes.map((n) => n.id));
      const ifaceLinksScoped = base.interfaceLinks;
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
            __isTree: false,
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
        : getBiLocalCore(base, rootId, maxDepth);

    depthMapRef.current = rootId == null ? null : core.depthById;

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

  useEffect(() => {
    configurePhaseForces();
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
            __isTree: false,
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

  /* ------------------ selection panel behavior ------------------ */

  // Keep panel anchored over the selected node (screen coords)
  useEffect(() => {
    if (!panelOpen || !selectedId) return;
    let raf;
    const loop = () => {
      const node = nodesRef.current.find((x) => x.id === selectedId);
      const p = nodeScreenXY(node);
      if (p) setPanelAnchor({ x: p.x, y: p.y - 48 }); // a bit above the node
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [panelOpen, selectedId]);

  // Focus input when editing starts (and zoom in)
  useEffect(() => {
    if (!editingId) return;
    const n = nodesRef.current.find((x) => x.id === editingId);
    if (n) {
      focusNode(n, { zoom: 25, ms: 500 });
    }
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  /* ------------------ UI events ------------------ */

  const handleDepthChange = (e) => {
    const v = Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 1));
    setUi((u) => ({ ...u, visibleDepth: v }));
    if (currentRootRef.current != null) startLocal(currentRootRef.current, v);
  };

  // Shift+Click: open selection panel with static short placeholders
  const handleNodeClick = (node, event) => {
    if (event?.shiftKey) {
      // clear any previous placeholders first
      clearAllPlaceholders();

      setSelectedId(node.id);
      setPanelOpen(true);
      setUsedOptions(new Set());
      setEditingId(null);

      // zoom in more on shift-click for clarity
      focusNode(node, { zoom: 15, ms: 600 });

      // spawn static placeholders outward toward "exterior"
      const built = spawnStaticPlaceholders(node);
      setOptionMap(built.map);

      setGraph((g) => ({
        nodes: [...g.nodes, ...built.nodes],
        links: [...g.links, ...built.links],
      }));
      return; // don't switch to local on shift-click
    }
    startLocal(node.id);
  };

  // Back to global / cancel edit / close panel
  const handleBackgroundClick = () => {
    // if editing a created node, revert it back to placeholder & close input
    if (panelOpen && editingId) {
      const pair = Object.entries(optionMap).find(([, id]) => id === editingId);
      const key = pair?.[0];

      setGraph((g) => {
        const nodes = g.nodes.map((n) => {
          if (n.id === editingId) {
            const nx = n.x ?? n.fx ?? 0;
            const ny = n.y ?? n.fy ?? 0;
            return {
              ...n,
              __placeholder: true,
              __color: PLACEHOLDER.nodeFill,
              name: "", // reset so option label returns to "Node X"
              fx: nx,
              fy: ny,
              static: false,
            };
          }
          return n;
        });
        const links = g.links.map((l) => {
          if (
            l.source === selectedId &&
            l.target === editingId &&
            !l.__placeholder
          ) {
            return { ...l, __placeholder: true };
          }
          return l;
        });
        return { nodes, links };
      });

      setEditingId(null);
      if (key) {
        setUsedOptions((prev) => {
          const s = new Set(prev);
          s.delete(key);
          return s;
        });
      }
      return; // leave panel open
    }

    // otherwise close panel and remove all placeholders
    if (panelOpen) {
      clearAllPlaceholders();
      setPanelOpen(false);
      setSelectedId(null);
      setEditingId(null);
      return;
    }

    if (currentRootRef.current != null) startGlobal();
  };

  // Toggle option:
  // - if placeholder -> convert to real, start naming (lock others)
  // - if already created -> revert to placeholder (gray), stop naming
  const handlePickOption = (key) => {
    if (!panelOpen || !selectedId) return;
    const pid = optionMap[key];
    if (!pid) return;

    const node = nodesRef.current.find((n) => n.id === pid);

    // If we're editing another id, you can't switch until done/cancel
    if (editingId && editingId !== pid) return;

    // If already created (not placeholder) -> revert back to placeholder
    if (node && !node.__placeholder) {
      setGraph((g) => {
        const nodes = g.nodes.map((n) => {
          if (n.id === pid) {
            const nx = n.x ?? n.fx ?? 0;
            const ny = n.y ?? n.fy ?? 0;
            return {
              ...n,
              __placeholder: true,
              __color: PLACEHOLDER.nodeFill,
              name: "", // reset name so option title reverts to "Node X"
              fx: nx,
              fy: ny,
              static: false,
            };
          }
          return n;
        });
        const links = g.links.map((l) => {
          if (l.source === selectedId && l.target === pid) {
            return { ...l, __placeholder: true, relation: "child_of" };
          }
          return l;
        });
        return { nodes, links };
      });
      setUsedOptions((prev) => {
        const s = new Set(prev);
        s.delete(key);
        return s;
      });
      if (editingId === pid) setEditingId(null);
      return;
    }

    // Convert placeholder -> real node/link and lock to current position
    setGraph((g) => {
      // capture anchor color so the new node inherits the selected node's color
      const anchor = g.nodes.find((n) => n.id === selectedId);
      const anchorColor = anchor ? colorForTreeNode(anchor) : "#E879F9";

      const nodes = g.nodes.map((n) => {
        if (n.id === pid && n.__placeholder) {
          const nx = n.x ?? n.fx ?? 0;
          const ny = n.y ?? n.fy ?? 0;
          return {
            ...n,
            __placeholder: false,
            __color: anchorColor, // inherit color from selected anchor node
            fx: nx,
            fy: ny,
            static: false,
            name: "", // to be typed
          };
        }
        return n;
      });
      const links = g.links.map((l) => {
        if (l.__placeholder && l.source === selectedId && l.target === pid) {
          return { ...l, __placeholder: false, relation: "child_of" };
        }
        return l;
      });
      return { nodes, links };
    });

    setUsedOptions((prev) => new Set(prev).add(key));
    setEditingId(pid);

    // center on newly created node with stronger zoom
    requestAnimationFrame(() => {
      const n = nodesRef.current.find((x) => x.id === pid);
      if (n) focusNode(n, { zoom: 25, ms: 500 });
    });
  };

  const handleCommitName = (e) => {
    e.preventDefault();
    const v = (e.target.elements?.nm?.value ?? "").trim();
    const id = editingId;
    if (!id) return;

    setGraph((g) => {
      const nodes = g.nodes.map((n) =>
        n.id === id ? { ...n, name: v || n.name } : n
      );
      return { ...g, nodes };
    });
    setEditingId(null); // unlock: can choose other options now
  };

  /* ------------------ render helpers ------------------ */

  const nodeVisibility = (n) => n.__isTree || ui.showInterface;
  const linkVisibility = (l) =>
    l.relation === "child_of" ? true : ui.showInterface;

  const approxRadius = (node) => {
    const isLocal = currentRootRef.current != null;
    const isCurrentRoot = node.__isTree && node.id === currentRootRef.current;

    let scale = node.scale ?? 1;

    // interface nodes slightly smaller
    if (!node.__isTree) scale *= IFSTYLE.nodeScaleMul;

    // boost all Function (root) nodes
    if (node.__isTree && isFunctionNode(node)) {
      scale *= 1.35;
    }

    // local-view scaling
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

  /* ------------------ render ------------------ */

  const selectedNode = useMemo(
    () => graph.nodes.find((n) => n.id === selectedId) || null,
    [graph.nodes, selectedId]
  );

  const lockedKey = editingId
    ? (Object.entries(optionMap).find(([, id]) => id === editingId) || [
        null,
      ])[0]
    : null;

  // Build dynamic option titles: use node's name when created, else "Node X"
  const optionsForOverlay = useMemo(() => {
    const result = [];
    for (const k of ["1", "2", "3"]) {
      const pid = optionMap[k];
      let title = `Node ${k}`;
      if (pid != null) {
        const n = graph.nodes.find((nn) => nn.id === pid);
        if (n && !n.__placeholder && n.name) {
          title = n.name;
        }
      }
      result.push({ key: k, title, used: usedOptions.has(k) });
    }
    return result;
  }, [optionMap, graph.nodes, usedOptions]);

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

      {/* Selection panel anchored above selected node */}
      <SelectionOverlay
        anchor={panelAnchor}
        visible={panelOpen && !!selectedNode}
        options={optionsForOverlay}
        onPick={handlePickOption}
        lockedKey={lockedKey}
      />

      {/* Inline rename input OVER the node being edited */}
      {editingId &&
        (() => {
          const n = nodesRef.current.find((x) => x.id === editingId);
          const p = nodeScreenXY(n);
          if (!p) return null;
          return (
            <form
              onSubmit={handleCommitName}
              className="fixed z-40 -translate-x-1/2 -translate-y-full bg-white/10 backdrop-blur-xl border border-white/20 rounded-lg shadow-lg px-2.5 py-1.5"
              style={{ left: p.x, top: p.y - 10 }}
            >
              <input
                ref={inputRef}
                name="nm"
                placeholder="Type name…"
                className="bg-transparent outline-none text-white text-sm placeholder:text-white/50"
                onBlur={handleCommitName}
              />
            </form>
          );
        })()}

      <ForceGraph2D
        ref={fgRef}
        graphData={{ nodes: graph.nodes, links: curvedLinks }}
        // physics lifecycle
        cooldownTicks={cooldownTicks}
        onEngineStop={handleEngineStop}
        // tooltip
        nodeLabel={(n) =>
          n.__placeholder && n.__placeholderName
            ? n.__placeholderName
            : `${n.id}: ${n.name ?? ""}`
        }
        // colors & widths (placeholder links pulse with alpha)
        linkColor={(l) => {
          if (l.__placeholder) {
            const a = pulseAlphaRef.current.toFixed(3);
            return `rgba(209,213,219,${a})`; // gray-300 with pulse
          }
          return l.relation === "interface"
            ? arrowStyle.colorInterface
            : STYLE.linkColor;
        }}
        linkWidth={(l) =>
          l.__placeholder
            ? (IFSTYLE.linkWidth + STYLE.linkWidth) / 2
            : l.relation === "interface"
            ? IFSTYLE.linkWidth
            : STYLE.linkWidth
        }
        // curves + arrows
        linkCurvature={(l) => l.__curv || 0}
        linkDirectionalArrowLength={(l) =>
          ui.blurInterface && l.relation === "interface" ? 0 : arrowStyle.length
        }
        linkDirectionalArrowRelPos={arrowRelPos}
        linkDirectionalArrowColor={(l) =>
          l.__placeholder
            ? `rgba(209,213,219,${pulseAlphaRef.current.toFixed(3)})`
            : l.relation === "interface"
            ? arrowStyle.colorInterface
            : arrowStyle.colorChild
        }
        linkDirectionalArrowResolution={arrowStyle.resolution}
        // optional custom link render (blurred interface)
        linkCanvasObject={(l, ctx) => {
          if (!ui.blurInterface || l.relation !== "interface") return;
          const s = l.source,
            t = l.target;
          if (!s || !t || typeof s !== "object" || typeof t !== "object")
            return;

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
          const curv = l.__curv || 0;
          const cpX = midx + nx * curv * dist;
          const cpY = midy + ny * curv * dist;

          ctx.save();
          ctx.filter = `blur(${ui.blurAmount}px)`;
          ctx.lineWidth = IFSTYLE.linkWidth;
          ctx.strokeStyle = IFSTYLE.linkColor;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.quadraticCurveTo(cpX, cpY, tx, ty);
          ctx.stroke();
          ctx.restore();
        }}
        linkCanvasObjectMode={(l) =>
          ui.blurInterface && l.relation === "interface" ? "replace" : undefined
        }
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
        onNodeClick={handleNodeClick}
        onBackgroundClick={handleBackgroundClick}
        // visibility toggles
        nodeVisibility={(n) => n.__isTree || ui.showInterface}
        linkVisibility={linkVisibility}
        // pointer hit area — smaller on zoom-in
        nodePointerAreaPaint={(node, color, ctx, globalScale) => {
          if (!(node.__isTree || ui.showInterface)) return;
          const denom = Math.max(
            globalScale / ZOOM_SIZE_DAMPING,
            STYLE.minZoomFontScale
          );
          const r = (approxRadius(node) / denom) * POINTER_HIT_SCALE;
          ctx.beginPath();
          ctx.arc(node.x, node.y, Math.max(1, r), 0, 2 * Math.PI, false);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        // draw nodes + labels (interface gray; placeholders pulsing gray; no borders)
        nodeCanvasObject={(node, ctx, globalScale) => {
          if (!(node.__isTree || ui.showInterface)) return;

          // ---------- helpers ----------
          const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
          const parseColor = (c) => {
            if (!c) return { r: 255, g: 255, b: 255, a: 1 };
            if (c.startsWith("#")) {
              const hex = c.slice(1);
              const full =
                hex.length === 3
                  ? hex
                      .split("")
                      .map((h) => h + h)
                      .join("")
                  : hex;
              const n = parseInt(full, 16);
              return {
                r: (n >> 16) & 255,
                g: (n >> 8) & 255,
                b: n & 255,
                a: 1,
              };
            }
            const m = c.match(/rgba?\(([^)]+)\)/i);
            if (m) {
              const p = m[1].split(",").map((s) => s.trim());
              const r = parseFloat(p[0]),
                g = parseFloat(p[1]),
                b = parseFloat(p[2]);
              const a = p[3] != null ? parseFloat(p[3]) : 1;
              return { r, g, b, a: isNaN(a) ? 1 : a };
            }
            return { r: 255, g: 255, b: 255, a: 1 };
          };
          const toRgba = ({ r, g, b, a }) =>
            `rgba(${clamp(Math.round(r), 0, 255)},${clamp(
              Math.round(g),
              0,
              255
            )},${clamp(Math.round(b), 0, 255)},${clamp(a, 0, 1)})`;
          const mix = (c, t, amt) => ({
            r: c.r + (t.r - c.r) * amt,
            g: c.g + (t.g - c.g) * amt,
            b: c.b + (t.b - c.b) * amt,
            a: c.a + (t.a - c.a) * amt,
          });
          const lighten = (c, amt) =>
            mix(c, { r: 255, g: 255, b: 255, a: c.a }, amt);
          const darken = (c, amt) => mix(c, { r: 0, g: 0, b: 0, a: c.a }, amt);

          // ---------- sizing ----------
          const denom = Math.max(
            globalScale / ZOOM_SIZE_DAMPING,
            STYLE.minZoomFontScale
          );
          const x = node.x ?? 0;
          const y = node.y ?? 0;
          const r = approxRadius(node) / denom;
          if (r <= 0) return;

          // ---------- fill color selection ----------
          let fill = IFSTYLE.nodeFill; // default for interface-only
          if (node.__isTree) {
            if (node.__placeholder) {
              const a = pulseAlphaRef.current;
              fill = `rgba(209,213,219,${a.toFixed(3)})`; // pulsing gray
            } else {
              fill = colorForTreeNode(node);
            }
          }
          const base = parseColor(fill);

          // ---------- BODY: strong inner glow & depth ----------
          const grad = ctx.createRadialGradient(x, y, r * 0.05, x, y, r * 0.98);
          grad.addColorStop(0.0, toRgba(lighten(base, 0.6))); // bright core
          grad.addColorStop(0.35, toRgba(lighten(base, 0.3)));
          grad.addColorStop(0.7, toRgba(base));
          grad.addColorStop(1.0, toRgba(darken(base, 0.35))); // dark edge

          // main disk (respect interface blur)
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

          // Inner rim highlight (thin bright ring just inside the edge)
          ctx.save();
          ctx.globalAlpha = 0.28;
          ctx.lineWidth = Math.max(1, r * 0.18);
          ctx.strokeStyle = "rgba(255,255,255,0.85)";
          ctx.beginPath();
          ctx.arc(x, y, r * 0.86, 0, 2 * Math.PI, false);
          ctx.stroke();
          ctx.restore();

          // Dark inner ring to punch the edge (no outer glow, purely inside)
          ctx.save();
          ctx.globalAlpha = 0.22;
          ctx.lineWidth = Math.max(1, r * 0.14);
          ctx.strokeStyle = "rgba(0,0,0,0.85)";
          ctx.beginPath();
          ctx.arc(x, y, r * 0.98, 0, 2 * Math.PI, false);
          ctx.stroke();
          ctx.restore();

          // Gloss sweep (thicker & brighter)
          ctx.save();
          ctx.globalAlpha = 0.4;
          ctx.lineWidth = Math.max(1, r * 0.36);
          ctx.strokeStyle = "white";
          ctx.beginPath();
          ctx.arc(
            x,
            y,
            r * 0.78,
            (-150 * Math.PI) / 180,
            (-20 * Math.PI) / 180,
            false
          );
          ctx.stroke();
          ctx.restore();

          // Specular highlight (bigger & brighter)
          ctx.save();
          ctx.globalAlpha = 0.55;
          ctx.beginPath();
          ctx.arc(x - r * 0.3, y - r * 0.32, r * 0.18, 0, 2 * Math.PI, false);
          ctx.fillStyle = "white";
          ctx.fill();
          ctx.restore();

          // ---------- LABELS (clean glass; placeholder vs real) ----------
          if (!ui.labelsVisible) return;
          if (!node.__isTree && ui.blurInterface) return;

          const showPlaceholder =
            node.__placeholder && !!node.__placeholderName;
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
    </div>
  );
}
