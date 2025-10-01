"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  arrowStyle,
} from "../../constants";
import { buildBase, getBiLocalCore, getForestCore } from "../../lib/base";
import { applyCurvatures } from "../../lib/geometry";
import { ticksFromMs, seedInterfacePositions, configureForces } from "../../lib/sim";
import { idOf, linkKey, computeNodeType } from "../../lib/graphKeys";

// dynamic import used by GraphCanvas, but we export it here so GraphCanvas stays tiny
export const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

/* ======= Placeholder config ======= */
const PLACEHOLDER = {
  count: 3,
  linkLen: 26,
  offsetsDeg: [-14, 0, 14],
  nodeFill: "#D1D5DB",
  pulseMinA: 0.45,
  pulseMaxA: 0.95,
};

const ZOOM_SIZE_DAMPING = 3;
const POINTER_HIT_SCALE = 0.4;

const colorForTreeNode = (node) =>
  /\bFunction\b/i.test(String(node?.name || "")) ? STYLE.nodeFillColor : node.__color || "#E879F9";

export function useGraphController(data) {
  const fgRef = useRef(null);

  // phases
  const [phase, setPhase] = useState("settleTree");
  const [cooldownTicks, setCooldownTicks] = useState(ticksFromMs(TIMING.settleTreeMs));
  const transitionedRef = useRef(false);
  const currentRootRef = useRef(null);
  const depthMapRef = useRef(null);

  // UI
  const [ui, setUi] = useState({
    draggable: FLAGS.draggable,
    showInterface: FLAGS.showInterface,
    blurInterface: BLUR.enabled ?? FLAGS.blurInterface,
    blurAmount: BLUR.amountPx,
    visibleDepth: LOCAL.visibleDepth,
    labelsVisible: true,
  });

  // base
  const base = useMemo(() => buildBase(data), [data]);
  const initialCore = useMemo(() => getForestCore(base, base.functionRoots), [base]);

  // meta stores
  const nodeMetaRef = useRef(new Map()); // id -> { __createdAt, attributes, __nodeType }
  const linkMetaRef = useRef(new Map()); // key -> { __createdAt, __validUntil, attributes }

  // initialize meta and label attributes
  useEffect(() => {
    const now = Date.now();
    // nodes
    for (const n of base.nodes) {
      const prev = nodeMetaRef.current.get(n.id) || {};
      const attributes =
        prev.attributes ||
        n.attributes ||
        { label: { name: n.name ?? "", type: "string" } };
      nodeMetaRef.current.set(n.id, {
        __createdAt: prev.__createdAt ?? now,
        attributes,
        __nodeType: prev.__nodeType ?? computeNodeType(n),
      });
    }
    // links
    for (const l of base.links) {
      const key = linkKey(l);
      const prev = linkMetaRef.current.get(key) || {};
      const attributes =
        prev.attributes ||
        l.attributes ||
        { label: { name: l.relation ?? "child_of", type: "string" } };
      linkMetaRef.current.set(key, {
        __createdAt: prev.__createdAt ?? now,
        __validUntil: prev.__validUntil ?? null,
        attributes,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // graph state
  const [graph, setGraph] = useState(() => {
    const now = Date.now();
    return {
      nodes: initialCore.nodes.map((n) => {
        const meta = nodeMetaRef.current.get(n.id) || {};
        return {
          ...n,
          static: false,
          __isTree: true,
          __color: base.colorById.get(n.id) || STYLE.nodeFillColor,
          __createdAt: meta.__createdAt ?? now,
          attributes: meta.attributes,
          __nodeType: meta.__nodeType ?? computeNodeType(n),
        };
      }),
      links: initialCore.links.map((l) => {
        const key = linkKey(l);
        const meta = linkMetaRef.current.get(key) || {};
        return {
          ...l,
          __createdAt: meta.__createdAt ?? now,
          __validUntil: meta.__validUntil ?? null,
          attributes: meta.attributes,
        };
      }),
    };
  });

  const nodesRef = useRef(graph.nodes);
  useEffect(() => {
    nodesRef.current = graph.nodes;
  }, [graph.nodes]);

  const globalSnapshotRef = useRef(null);

  // selection overlay / placeholder creation
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [panelAnchor, setPanelAnchor] = useState(null);
  const [optionMap, setOptionMap] = useState({});
  const [usedOptions, setUsedOptions] = useState(new Set());
  const [editingId, setEditingId] = useState(null);
  const inputRef = useRef(null);

  // right menu
  const [rightOpen, setRightOpen] = useState(false);
  const [rightKind, setRightKind] = useState(null);
  const [rightData, setRightData] = useState(null);

  // performance: throttled redraw
  const pulseAlphaRef = useRef(PLACEHOLDER.pulseMaxA);
  const pulseTRef = useRef(0);
  const rafRef = useRef(null);

  const placeholdersExist = useMemo(
    () => graph.nodes.some((n) => n.__placeholder) || graph.links.some((l) => l.__placeholder),
    [graph.nodes, graph.links]
  );
  const needsAnimation = rightOpen || panelOpen || placeholdersExist;

  useEffect(() => {
    if (!needsAnimation) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }
    let last = 0;
    const step = (t) => {
      const dt = t - last;
      if (dt >= 40) {
        last = t;
        const sec = t / 1000;
        pulseTRef.current = sec;
        const s = 0.5 + 0.5 * Math.sin(sec * 2 * Math.PI * 0.9);
        pulseAlphaRef.current =
          PLACEHOLDER.pulseMinA +
          (PLACEHOLDER.pulseMaxA - PLACEHOLDER.pulseMinA) * s;
        fgRef.current?.refresh?.();
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [needsAnimation]);

  /* ---------- helpers ---------- */
  const fitNow = () => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.zoomToFit(TIMING.fitDurationMs, VIEW.fitPadding);
    setTimeout(() => fg.centerAt(0, 0, TIMING.fitDurationMs / 2), TIMING.fitDurationMs);
  };

  const pulseDragToggle = () => {
    setUi((prev) => {
      const original = prev.draggable;
      const flipped = !original;
      const next = { ...prev, draggable: flipped };
      setTimeout(() => setUi((after) => ({ ...after, draggable: original })), 120);
      return next;
    });
  };

  const pulseDragJitter = (times = 3, intervalMs = 70) => {
    const initial = ui.draggable;
    let flips = 0;
    const tick = () => {
      setUi((prev) => ({ ...prev, draggable: !prev.draggable }));
      flips += 1;
      if (flips < times * 2) setTimeout(tick, intervalMs);
      else setTimeout(() => setUi((prev) => ({ ...prev, draggable: initial })), intervalMs);
    };
    tick();
  };

  const configurePhaseForces = () => configureForces(fgRef.current, phase, FORCE);

  const kickInterfaceSim = () => {
    const fg = fgRef.current;
    if (!fg) return;
    configurePhaseForces();
    const gd = typeof fg.graphData === "function" ? fg.graphData() : fg.graphData;
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

  const nodeScreenXY = (node) => {
    const fg = fgRef.current;
    if (!fg || !node) return null;
    const { x = 0, y = 0 } = node;
    const p = fg.graph2ScreenCoords?.(x, y);
    return p ? { x: p.x, y: p.y } : null;
  };

  const focusNode = (node, { zoom = 2, ms = 600 } = {}) => {
    const fg = fgRef.current;
    if (!fg || !node) return;
    fg.centerAt(node.x ?? 0, node.y ?? 0, ms);
    fg.zoom(zoom, ms);
  };

  const outwardAnglesDeg = (node) => {
    const theta = Math.atan2(node.y ?? 0, node.x ?? 0) * (180 / Math.PI);
    return PLACEHOLDER.offsetsDeg.map((o) => theta + o);
  };

  const spawnStaticPlaceholders = (anchorNode) => {
    const angs = outwardAnglesDeg(anchorNode);
    const map = {};
    const newNodes = [];
    const newLinks = [];
    angs.slice(0, PLACEHOLDER.count).forEach((deg, idx) => {
      const id = (PLACEHOLDER._seq = (PLACEHOLDER._seq || -1) - 1);
      map[String(idx + 1)] = id;
      const rad = (deg * Math.PI) / 180;
      const dx = Math.cos(rad) * PLACEHOLDER.linkLen;
      const dy = Math.sin(rad) * PLACEHOLDER.linkLen;
      const px = (anchorNode.x ?? 0) + dx;
      const py = (anchorNode.y ?? 0) + dy;

      newNodes.push({
        id,
        name: "",
        __placeholderName: `Node ${idx + 1}`,
        scale: 0.9,
        __isTree: true,
        __placeholder: true,
        __color: PLACEHOLDER.nodeFill,
        x: px,
        y: py,
        fx: px,
        fy: py,
        static: false,
        __createdAt: Date.now(),
        attributes: { label: { name: `Node ${idx + 1}`, type: "string" } },
        __nodeType: "other",
      });

      newLinks.push({
        source: anchorNode.id,
        target: id,
        relation: "child_of",
        __placeholder: true,
        __createdAt: Date.now(),
        attributes: { label: { name: "child_of", type: "string" } },
      });
    });
    return { nodes: newNodes, links: newLinks, map };
  };

  const clearAllPlaceholders = () => {
    setGraph((g) => ({
      nodes: g.nodes.filter((n) => !n.__placeholder),
      links: g.links.filter((l) => !l.__placeholder),
    }));
    setOptionMap({});
    setUsedOptions(new Set());
  };

  const mergeNodeMeta = (arr) =>
    arr.map((n) => {
      const meta = nodeMetaRef.current.get(n.id);
      return {
        ...n,
        __createdAt: meta?.__createdAt ?? Date.now(),
        attributes:
          meta?.attributes ??
          n.attributes ?? { label: { name: n.name ?? "", type: "string" } },
        __nodeType: meta?.__nodeType ?? computeNodeType(n),
      };
    });

  const mergeLinkMeta = (arr) =>
    arr.map((l) => {
      const meta = linkMetaRef.current.get(linkKey(l));
      return {
        ...l,
        __createdAt: meta?.__createdAt ?? Date.now(),
        __validUntil: meta?.__validUntil ?? null,
        attributes:
          meta?.attributes ??
          l.attributes ?? { label: { name: l.relation ?? "child_of", type: "string" } },
      };
    });

  // start scenes
  const startScene = (rootId, depthOverride = null) => {
    currentRootRef.current = rootId;
    transitionedRef.current = false;

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

      const allNodes = mergeNodeMeta(
        base.nodes
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
          })
      );

      seedInterfacePositions(base, allNodes, treeSet, IFPLACEMENT);

      const allLinks = mergeLinkMeta([
        ...base.childLinks.filter(
          (l) => treeSet.has(l.source) && treeSet.has(l.target)
        ),
        ...ifaceLinksScoped,
      ]).map((l) => ({ ...l }));

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

    setPhase("settleTree");
    setCooldownTicks(ticksFromMs(TIMING.settleTreeMs));

    const maxDepth = rootId == null ? null : depthOverride ?? ui.visibleDepth;
    const core =
      rootId == null ? getForestCore(base, base.functionRoots) : getBiLocalCore(base, rootId, maxDepth);

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
      nodes: mergeNodeMeta(
        core.nodes.map((n) => ({
          ...n,
          static: false,
          __isTree: true,
          __color: base.colorById.get(n.id) || STYLE.nodeFillColor,
        }))
      ),
      links: mergeLinkMeta(core.links.map((l) => ({ ...l }))),
    });
  };

  const startLocal = (id, depthOverride = null) => startScene(id, depthOverride);
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
    if (phase === "settleTree") pulseDragJitter(3, 70);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleEngineStop = () => {
    const fg = fgRef.current;
    if (!fg) return;

    if (phase === "settleTree" && !transitionedRef.current) {
      transitionedRef.current = true;

      const fixed = new Map();
      for (const n of nodesRef.current) {
        if (!n.__isTree) continue;
        fixed.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
      }
      const treeSet = new Set(fixed.keys());

      if (currentRootRef.current == null && !globalSnapshotRef.current) {
        const nodesSnap = [...nodesRef.current]
          .filter((n) => n.__isTree)
          .map((n) => ({ id: n.id, x: n.x, y: n.y, fx: n.x, fy: n.y, static: true }));
        globalSnapshotRef.current = { nodes: nodesSnap, byId: new Map(nodesSnap.map((n) => [n.id, n])) };
      }

      const isGlobal = currentRootRef.current == null;
      const ifaceLinksScoped = isGlobal
        ? base.interfaceLinks
        : base.interfaceLinks.filter((l) => treeSet.has(l.source) || treeSet.has(l.target));

      const ifaceNodeIds = new Set();
      for (const l of ifaceLinksScoped) {
        ifaceNodeIds.add(l.source);
        ifaceNodeIds.add(l.target);
      }
      const finalNodeIds = new Set([...treeSet, ...ifaceNodeIds]);

      const allNodes = mergeNodeMeta(
        base.nodes
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
          })
      );

      seedInterfacePositions(base, allNodes, treeSet, IFPLACEMENT);

      const treeLinksScoped = base.childLinks.filter(
        (l) => treeSet.has(l.source) && treeSet.has(l.target)
      );
      const allLinks = mergeLinkMeta([...treeLinksScoped, ...ifaceLinksScoped]).map((l) => ({ ...l }));

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

  // overlay tracking
  useEffect(() => {
    if (!panelOpen || !selectedId) return;
    let raf;
    const loop = () => {
      const node = nodesRef.current.find((x) => x.id === selectedId);
      const p = nodeScreenXY(node);
      if (p) setPanelAnchor({ x: p.x, y: p.y - 48 });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [panelOpen, selectedId]);

  useEffect(() => {
    if (!editingId) return;
    const n = nodesRef.current.find((x) => x.id === editingId);
    if (n) focusNode(n, { zoom: 25, ms: 500 });
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  // UI handlers
  const handleDepthChange = (e) => {
    const v = Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 1));
    setUi((u) => ({ ...u, visibleDepth: v }));
    if (currentRootRef.current != null) startLocal(currentRootRef.current, v);
  };

  // Ctrl+click node opens RightMenu
  const openRightForNode = (node) => {
    const prev = nodeMetaRef.current.get(node.id) || {};
    nodeMetaRef.current.set(node.id, {
      __createdAt: prev.__createdAt ?? Date.now(),
      attributes:
        prev.attributes ??
        node.attributes ?? { label: { name: node.name ?? "", type: "string" } },
      __nodeType: prev.__nodeType ?? node.__nodeType ?? computeNodeType(node),
    });
    setRightKind("node");
    setRightData(node);
    setRightOpen(true);
  };

  const handleNodeClick = (node, event) => {
    if (event?.ctrlKey || event?.metaKey) {
      openRightForNode(node);
      return;
    }
    if (event?.shiftKey) {
      clearAllPlaceholders();
      setSelectedId(node.id);
      setPanelOpen(true);
      setUsedOptions(new Set());
      setEditingId(null);
      focusNode(node, { zoom: 15, ms: 600 });

      const built = spawnStaticPlaceholders(node);
      setOptionMap(built.map);
      setGraph((g) => ({ nodes: [...g.nodes, ...built.nodes], links: [...g.links, ...built.links] }));
      return;
    }
    startLocal(node.id);
  };

  const handleLinkClick = (link, event) => {
    if (!(event?.ctrlKey || event?.metaKey)) return;
    const key = linkKey(link);
    const prev = linkMetaRef.current.get(key) || {};
    linkMetaRef.current.set(key, {
      __createdAt: prev.__createdAt ?? Date.now(),
      __validUntil: prev.__validUntil ?? null,
      attributes:
        prev.attributes ??
        link.attributes ?? { label: { name: link.relation ?? "child_of", type: "string" } },
    });
    setRightKind("link");
    setRightData(link);
    setRightOpen(true);
  };

  const handleBackgroundClick = () => {
    // cancel inline edit to placeholder, keep panel open
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
              name: "",
              fx: nx,
              fy: ny,
              static: false,
            };
          }
          return n;
        });
        const links = g.links.map((l) => {
          if (l.source === selectedId && l.target === editingId && !l.__placeholder) {
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
      return;
    }

    if (panelOpen) {
      clearAllPlaceholders();
      setPanelOpen(false);
      setSelectedId(null);
      setEditingId(null);
      return;
    }

    if (rightOpen) {
      setRightOpen(false);
      setRightData(null);
      setRightKind(null);
      return;
    }

    if (currentRootRef.current != null) startGlobal();
  };

  // create panel toggle
  const handlePickOption = (key) => {
    if (!panelOpen || !selectedId) return;
    const pid = optionMap[key];
    if (!pid) return;

    const node = nodesRef.current.find((n) => n.id === pid);
    if (editingId && editingId !== pid) return;

    // revert created to placeholder
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
              name: "",
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

    // placeholder -> real
    setGraph((g) => {
      const anchor = g.nodes.find((n) => n.id === selectedId);
      const anchorColor = anchor ? colorForTreeNode(anchor) : "#E879F9";

      const nodes = g.nodes.map((n) => {
        if (n.id === pid && n.__placeholder) {
          const nx = n.x ?? n.fx ?? 0;
          const ny = n.y ?? n.fy ?? 0;
          return {
            ...n,
            __placeholder: false,
            __color: anchorColor,
            fx: nx,
            fy: ny,
            static: false,
            name: "",
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
        n.id === id
          ? {
              ...n,
              name: v || n.name,
              attributes: {
                ...(n.attributes || {}),
                label: { name: v || n.name || "", type: "string" },
              },
            }
          : n
      );
      return { ...g, nodes };
    });
    setEditingId(null);
  };

  // Right menu save handlers + propagation rules
  const saveRightNode = ({ attributes, nodeType }) => {
    if (!rightData) return;
    const id = rightData.id;

    // persist for this node
    const prev = nodeMetaRef.current.get(id) || {};
    nodeMetaRef.current.set(id, {
      __createdAt: prev.__createdAt ?? Date.now(),
      attributes,
      __nodeType: nodeType,
    });

    // propagate NEW keys (not values) to other nodes of same type
    const thisKeys = new Set(Object.keys(attributes || {}));
    setGraph((g) => {
      const nodes = g.nodes.map((n) => {
        if (n.id === id) return { ...n, attributes: { ...attributes }, __nodeType: nodeType };
        if ((n.__nodeType ?? computeNodeType(n)) !== nodeType) return n;

        const cloned = { ...(n.attributes || {}) };
        for (const k of thisKeys) {
          if (!(k in cloned)) {
            cloned[k] = { name: "", type: attributes[k]?.type || "string" }; // empty value
          }
        }
        return { ...n, attributes: cloned };
      });
      return { ...g, nodes };
    });
  };

  const saveRightLink = ({ attributes, validUntil }) => {
    if (!rightData) return;
    const key = linkKey(rightData);

    // persist for this link
    const prev = linkMetaRef.current.get(key) || {};
    linkMetaRef.current.set(key, {
      __createdAt: prev.__createdAt ?? Date.now(),
      __validUntil: validUntil,
      attributes,
    });

    // propagate NEW keys to other links of same relation
    const rel = rightData.relation || "child_of";
    const thisKeys = new Set(Object.keys(attributes || {}));

    setGraph((g) => {
      const links = g.links.map((l) => {
        const lk = linkKey(l);
        if (lk === key) return { ...l, __validUntil: validUntil, attributes: { ...attributes } };
        if ((l.relation || "child_of") !== rel) return l;
        const cloned = { ...(l.attributes || {}) };
        for (const k of thisKeys) {
          if (!(k in cloned)) {
            cloned[k] = { name: "", type: attributes[k]?.type || "string" };
          }
        }
        return { ...l, attributes: cloned };
      });
      return { ...g, links };
    });
  };

  // computed bits for render
  const curvedLinks = useMemo(
    () => applyCurvatures(graph.links.map((l) => ({ ...l }))),
    [graph.links]
  );

  const selectedNode = useMemo(
    () => graph.nodes.find((n) => n.id === selectedId) || null,
    [graph.nodes, selectedId]
  );

  const lockedKey = editingId
    ? (Object.entries(optionMap).find(([, id]) => id === editingId) || [null])[0]
    : null;

  const optionsForOverlay = useMemo(() => {
    const result = [];
    for (const k of ["1", "2", "3"]) {
      const pid = optionMap[k];
      let title = `Node ${k}`;
      if (pid != null) {
        const n = graph.nodes.find((nn) => nn.id === pid);
        if (n && !n.__placeholder && n.name) title = n.name;
      }
      result.push({ key: k, title, used: usedOptions.has(k) });
    }
    return result;
  }, [optionMap, graph.nodes, usedOptions]);

  // legend (functions by severity/components)
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

  // visibility / sizing helpers exposed for rendering
  const nodeVisibility = (n) => n.__isTree || ui.showInterface;
  const linkVisibility = (l) => (l.relation === "child_of" ? true : ui.showInterface);

  const approxRadius = useCallback(
    (node, globalScale = 1) => {
      const isLocal = currentRootRef.current != null;
      const isCurrentRoot = node.__isTree && node.id === currentRootRef.current;
      let scale = node.scale ?? 1;
      if (!node.__isTree) scale *= IFSTYLE.nodeScaleMul;
      if (node.__isTree && /\bFunction\b/i.test(String(node?.name || ""))) scale *= 1.35;
      if (node.__isTree && isLocal) {
        if (isCurrentRoot) scale *= LOCAL_SCALING.rootScaleMul;
        else if (depthMapRef.current) {
          const d = depthMapRef.current.get(node.id);
          if (typeof d === "number" && d > 0) scale *= Math.pow(LOCAL_SCALING.childDecay, d);
        }
      }
      return STYLE.nodeRadiusPx * scale;
    },
    []
  );

  const arrowRelPos = useCallback(
    (link) => {
      const s = link.source, t = link.target;
      if (!s || !t || typeof s !== "object" || typeof t !== "object") return 0.95;
      const dx = (t.x ?? 0) - (s.x ?? 0);
      const dy = (t.y ?? 0) - (s.y ?? 0);
      const len = Math.hypot(dx, dy) || 1;
      const tr = approxRadius(t) + (arrowStyle.relPosPadPx || 0);
      return Math.max(0.1, 1 - tr / len);
    },
    [approxRadius]
  );

  // close Right
  const closeRight = () => {
    setRightOpen(false);
    setRightData(null);
    setRightKind(null);
  };

  // build inline rename form renderer
  const renderInlineRename = () => {
    if (!editingId) return null;
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
  };

  return {
    // refs + state for canvas
    fgRef,
    graph,
    curvedLinks,
    cooldownTicks,
    handleEngineStop,

    // UI + settings
    ui,
    setUi,
    legend,

    // selection overlay
    panelOpen,
    panelAnchor,
    selectedId,
    selectedNode,
    optionsForOverlay,
    lockedKey,
    handlePickOption,

    // interactions
    handleNodeClick,
    handleLinkClick,
    handleBackgroundClick,
    handleDepthChange,

    // right menu
    rightOpen,
    rightKind,
    rightData,
    saveRightNode,
    saveRightLink,
    closeRight,

    // perf pulse
    pulseAlphaRef,
    pulseTRef,

    // render helpers for GraphCanvas
    nodeVisibility,
    linkVisibility,
    approxRadius,
    arrowRelPos,

    // constants/accessors
    ZOOM_SIZE_DAMPING,
    POINTER_HIT_SCALE,
    STYLE,
    IFSTYLE,
    LABELS,
    arrowStyle,

    renderInlineRename,
  };
}
