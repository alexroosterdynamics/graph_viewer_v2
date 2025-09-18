// app/lib/selection.js

export function makePlaceholders({
  anchorNode,
  currentNodes,
  count = 3,
  distance = 55, // << use constants distance (normal link length)
  dynamicTimeMs = 2000, // << placeholders are dynamic for this long, then freeze
  startId = null,
}) {
  const usedIds = new Set(currentNodes.map((n) => n.id));
  let nextId =
    startId ??
    (currentNodes.length
      ? Math.max(...currentNodes.map((n) => Number(n.id) || 0)) + 1
      : 1);

  const placeholders = [];
  const links = [];
  const map = {};
  const anchorId = anchorNode.id;

  const R = distance; // << normal length
  const a0 = (220 * Math.PI) / 180;
  const a1 = (320 * Math.PI) / 180;

  const now = performance.now();

  for (let i = 0; i < count; i++) {
    while (usedIds.has(nextId)) nextId++;
    const id = nextId++;
    const t = count === 1 ? 0.5 : i / (count - 1);
    const a = a0 + t * (a1 - a0);

    const px = (anchorNode.x ?? 0) + R * Math.cos(a);
    const py = (anchorNode.y ?? 0) + R * Math.sin(a);

    const node = {
      id,
      name: `Option ${i + 1}`,
      scale: 1,
      static: false, // keep non-static so it's draggable after freeze
      x: px,
      y: py,
      __placeholder: true,
      __spawnAt: now, // << for 2s dynamic window
      __freezeAfter: dynamicTimeMs,
      __frozen: false,
      __isTree: true, // stays in tree layer so child_of renders/arrows
    };
    const link = {
      source: anchorId,
      target: id,
      relation: "child_of",
      __placeholder: true,
    };

    placeholders.push(node);
    links.push(link);
    map[String(i + 1)] = id;
  }

  return { nodes: placeholders, links, map, nextId };
}

export function nodeScreenXY(fg, node) {
  if (!fg || !node) return null;
  try {
    if (typeof fg.graph2ScreenCoords === "function") {
      const p = fg.graph2ScreenCoords(node.x ?? 0, node.y ?? 0);
      return p || null;
    }
  } catch (_) {}
  return null;
}

export function focusNode(fg, node, { zoom = 3.0, ms = 600 } = {}) {
  if (!fg || !node) return;
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  fg.centerAt(x, y, ms);
  fg.zoom(Math.max(1, Math.min(6, zoom)), ms);
}

export function pulseAlpha(t) {
  // t in ms; ~1Hz
  const s = Math.sin((t / 1000) * 2 * Math.PI);
  return 0.6 + 0.3 * (s * 0.5 + 0.5); // 0.6..0.75
}
