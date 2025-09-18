// app/lib/base.js
export function buildBase(raw) {
  // normalize links to plain ids
  const links = raw.links.map((l) => ({
    source: typeof l.source === "object" ? l.source.id : l.source,
    target: typeof l.target === "object" ? l.target.id : l.target,
    relation: l.relation || "child_of",
  }));

  const nodes = raw.nodes.map((n) => ({ ...n }));
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // split link sets
  const childLinks = links.filter((l) => l.relation === "child_of");
  const interfaceLinks = links.filter((l) => l.relation !== "child_of");

  // children & parents maps
  const children = new Map(nodes.map((n) => [n.id, []]));
  const parents = new Map(nodes.map((n) => [n.id, []]));
  for (const l of childLinks) {
    if (byId.has(l.source) && byId.has(l.target)) {
      children.get(l.source).push(l.target);
      parents.get(l.target).push(l.source);
    }
  }

  // interface adjacency (undirected for placement proximity)
  const ifaceAdj = new Map(nodes.map((n) => [n.id, new Set()]));
  for (const l of interfaceLinks) {
    if (byId.has(l.source) && byId.has(l.target)) {
      ifaceAdj.get(l.source).add(l.target);
      ifaceAdj.get(l.target).add(l.source);
    }
  }

  // classical forest roots = nodes with no parents
  const roots = nodes
    .filter((n) => (parents.get(n.id) || []).length === 0)
    .map((n) => n.id);

  // function roots = nodes that carry a numeric severity (or look like Functions)
  const functionRoots = nodes
    .filter(
      (n) =>
        typeof n.severity === "number" ||
        /\bFunction\b/i.test(String(n.name || ""))
    )
    .map((n) => n.id);

  // severity stats over nodes that actually have severity
  const sevNodes = nodes.filter((n) => typeof n.severity === "number");
  const sevMin = sevNodes.length
    ? Math.min(...sevNodes.map((n) => n.severity))
    : 0;
  const sevMax = sevNodes.length
    ? Math.max(...sevNodes.map((n) => n.severity))
    : 1;

  // helpers for color interpolation
  const lerp = (a, b, t) => a + (b - a) * t;
  const hexToRgb = (hex) => {
    const h = hex.replace("#", "");
    const i = parseInt(h, 16);
    return { r: (i >> 16) & 255, g: (i >> 8) & 255, b: i & 255 };
  };
  const rgbToHex = (r, g, b) =>
    "#" +
    [r, g, b]
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, "0")
      )
      .join("");

  // fuchsia/magenta ramp (light → deep)
  const LIGHT = "#FFE3FF";
  const DARK = "#6B0F6B";
  const severityToColor = (sev) => {
    if (!sevNodes.length) return DARK;
    const t = sevMax === sevMin ? 1 : (sev - sevMin) / (sevMax - sevMin);
    const a = hexToRgb(LIGHT),
      b = hexToRgb(DARK);
    return rgbToHex(lerp(a.r, b.r, t), lerp(a.g, b.g, t), lerp(a.b, b.b, t));
  };

  // Assign colors: function nodes + all descendants inherit the function's severity color.
  const colorById = new Map();
  const tById = new Map(); // to resolve overlaps by keeping the most severe

  for (const fid of functionRoots) {
    const fnode = byId.get(fid);
    const sev =
      typeof fnode?.severity === "number" ? fnode.severity : sevMax || 1;
    const color = severityToColor(sev);
    const t =
      sevMax === sevMin ? 1 : (sev - sevMin) / Math.max(1, sevMax - sevMin);

    const q = [fid];
    const seen = new Set(q);
    while (q.length) {
      const id = q.shift();
      const prevT = tById.get(id);
      if (prevT === undefined || t > prevT) {
        colorById.set(id, color);
        tById.set(id, t);
      }
      for (const c of children.get(id) || []) {
        if (!seen.has(c)) {
          seen.add(c);
          q.push(c);
        }
      }
    }
  }

  // Ensure every node has a color (interface-only or unassigned get a neutral along the same ramp)
  const tOf = (s) =>
    sevMax === sevMin ? 1 : (s - sevMin) / Math.max(1, sevMax - sevMin);
  const tAvg = sevNodes.length
    ? sevNodes.reduce((acc, n) => acc + tOf(n.severity), 0) / sevNodes.length
    : 0.35;
  const a = hexToRgb(LIGHT),
    b = hexToRgb(DARK);
  const neutralColor = rgbToHex(
    lerp(a.r, b.r, tAvg),
    lerp(a.g, b.g, tAvg),
    lerp(a.b, b.b, tAvg)
  );
  for (const n of nodes) {
    if (!colorById.has(n.id)) colorById.set(n.id, neutralColor);
  }

  return {
    nodes,
    links,
    childLinks,
    interfaceLinks,
    byId,
    children,
    parents,
    ifaceAdj,
    roots,
    functionRoots,
    colorById,
  };
}

// multi-root forest core (union of descendants from all seeds)
export function getForestCore(base, seedRoots) {
  const seeds = seedRoots && seedRoots.length ? seedRoots : base.roots;

  const inSet = new Set(seeds);
  const q = [...seeds];
  while (q.length) {
    const id = q.shift();
    for (const c of base.children.get(id) || []) {
      if (!inSet.has(c)) {
        inSet.add(c);
        q.push(c);
      }
    }
  }
  const nodes = base.nodes
    .filter((n) => inSet.has(n.id))
    .map((n) => ({ ...n }));
  const links = base.childLinks
    .filter((l) => inSet.has(l.source) && inSet.has(l.target))
    .map((l) => ({ ...l }));
  return { nodes, links, set: inSet };
}

// bi-directional local core (ancestors + descendants)
export function getBiLocalCore(base, rootId, depth) {
  const byId = base.byId;
  if (!byId.has(rootId))
    return { nodes: [], links: [], set: new Set(), depthById: new Map() };

  // Descendants (downstream) + depth map (for scaling)
  const downSet = new Set([rootId]);
  const depthById = new Map([[rootId, 0]]);
  const dq = [[rootId, 0]];
  while (dq.length) {
    const [id, d] = dq.shift();
    if (d >= depth) continue;
    for (const c of base.children.get(id) || []) {
      if (!downSet.has(c)) {
        downSet.add(c);
        depthById.set(c, d + 1);
        dq.push([c, d + 1]);
      }
    }
  }

  // Ancestors (upstream)
  const upSet = new Set([rootId]);
  const uq = [[rootId, 0]];
  while (uq.length) {
    const [id, d] = uq.shift();
    if (d >= depth) continue;
    for (const p of base.parents.get(id) || []) {
      if (!upSet.has(p)) {
        upSet.add(p);
        uq.push([p, d + 1]);
      }
    }
  }

  const inSet = new Set([...downSet, ...upSet]);
  const nodes = base.nodes
    .filter((n) => inSet.has(n.id))
    .map((n) => ({ ...n }));
  const links = base.childLinks
    .filter((l) => inSet.has(l.source) && inSet.has(l.target))
    .map((l) => ({ ...l }));

  return { nodes, links, set: inSet, depthById };
}
