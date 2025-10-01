// app/lib/sim.js
import { forceCollide } from "d3-force";

// ~60 fps → ~16ms per tick
export const ticksFromMs = (ms) => Math.max(1, Math.round(ms / 16));

/**
 * Place interface-only nodes near their closest tree anchor in a small arc.
 */
export function seedInterfacePositions(base, nodesArr, treeSet, IFPLACEMENT) {
  const byId = new Map(nodesArr.map((n) => [n.id, n]));
  const anchorPos = new Map();
  nodesArr.forEach((n) => {
    if (treeSet.has(n.id)) anchorPos.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
  });

  const start = (IFPLACEMENT.startDeg * Math.PI) / 180;
  const end = (IFPLACEMENT.endDeg * Math.PI) / 180;
  const marg = (IFPLACEMENT.marginDeg * Math.PI) / 180;
  const a0 = start + marg,
    a1 = end - marg;
  const R = IFPLACEMENT.ringRadiusPx;

  // bucket interface nodes by anchor tree id
  const buckets = new Map(); // anchorId -> nodeId[]
  for (const n of nodesArr) {
    if (treeSet.has(n.id)) continue; // skip tree nodes
    const neigh = base.ifaceAdj.get(n.id) || new Set();
    let anchor = null;
    for (const m of neigh)
      if (treeSet.has(m)) {
        anchor = m;
        break;
      }
    if (!anchor) continue; // only place if it touches the tree
    if (!buckets.has(anchor)) buckets.set(anchor, []);
    buckets.get(anchor).push(n.id);
  }

  for (const [anchorId, list] of buckets.entries()) {
    const p = anchorPos.get(anchorId) || { x: 0, y: 0 };
    for (let i = 0; i < list.length; i++) {
      const a =
        list.length === 1
          ? (a0 + a1) / 2
          : a0 + (i * (a1 - a0)) / (list.length - 1);
      const x = p.x + R * Math.cos(a);
      const y = p.y + R * Math.sin(a);
      const node = byId.get(list[i]);
      node.x = x;
      node.y = y;
    }
  }
}

/**
 * Apply current FORCE params to the simulation and reheat.
 * Ensures link force re-binds to CURRENT links so distance/strength take effect.
 * Adds collision + boosted phase-1 (settleTree) force to reduce overlaps.
 */
export function configureForces(
  fg,
  phaseName,
  FORCE,
  { collideRadius = 18, collideStrength = 1.0, boostFactor = 1.8 } = {}
) {
  if (!fg) return;

  // Current links snapshot (IMPORTANT so new distances apply)
  const gd = typeof fg.graphData === "function" ? fg.graphData() : fg.graphData;
  const links = gd?.links || [];

  const linkF = fg.d3Force("link");
  if (linkF) {
    const boostedTreeLS =
      phaseName === "settleTree"
        ? FORCE.tree.linkStrength * boostFactor
        : FORCE.tree.linkStrength;

    linkF
      .id((d) => d.id)
      .distance((l) =>
        l.relation === "interface"
          ? +FORCE.interface.linkDistance
          : +FORCE.tree.linkDistance
      )
      .strength((l) =>
        phaseName === "withInterface"
          ? (l.relation === "interface" ? FORCE.interface.linkStrength : 0.05) // tiny non-zero to help distance settle
          : (l.relation === "interface" ? FORCE.interface.linkStrength : boostedTreeLS)
      );

    // Rebind to current links so the new distance is actually used
    linkF.links(links);
  }

  const chargeF = fg.d3Force("charge");
  if (chargeF) {
    const boostedTreeCharge =
      phaseName === "settleTree"
        ? FORCE.tree.charge * boostFactor
        : FORCE.tree.charge;

    chargeF
      .strength((d) =>
        phaseName === "withInterface"
          ? (d.__isTree ? 0 : FORCE.interface.charge)
          : (d.__isTree ? boostedTreeCharge : FORCE.interface.charge)
      )
      .distanceMin(1)
      .distanceMax(2000);
  }

  if (phaseName === "settleTree") {
    fg.d3Force(
      "collide",
      forceCollide((d) => (d.__isTree ? collideRadius * (d.scale ?? 1) : 0))
        .strength(collideStrength)
        .iterations(2)
    );
  } else {
    fg.d3Force("collide", null);
  }

  // Let distances stretch faster
  fg.d3VelocityDecay?.(0.25);
  // Kick the sim hard for first layout so distance is respected
  fg.d3AlphaTarget?.(0.7);
  fg.d3ReheatSimulation?.();
}