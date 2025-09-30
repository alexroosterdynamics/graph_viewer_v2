// app/lib/geometry.js

function endpoints(link) {
  const s = typeof link.source === "object" ? link.source.id : link.source;
  const t = typeof link.target === "object" ? link.target.id : link.target;
  return [s, t];
}
function pairKeyOf(link) {
  const [s, t] = endpoints(link);
  const a = s < t ? s : t;
  const b = s < t ? t : s;
  return `${a}::${b}`;
}

/**
 * Curvature:
 * - child_of always straight (0)
 * - interface straight only if it's the only link between the pair
 * - otherwise curve and fan: +k, -k, +2k, -2k...
 */
export function applyCurvatures(links, { base = 0.22 } = {}) {
  links.forEach((l) => {
    l.__curv = 0;
  });

  const groups = new Map(); // key -> { child:[], iface:[] }
  for (const l of links) {
    const key = pairKeyOf(l);
    if (!groups.has(key)) groups.set(key, { child: [], iface: [] });
    if (l.relation === "interface") groups.get(key).iface.push(l);
    else groups.get(key).child.push(l);
  }

  for (const { child, iface } of groups.values()) {
    child.forEach((l) => {
      l.__curv = 0;
    });
    if (iface.length === 0) continue;
    if (child.length === 0 && iface.length === 1) {
      iface[0].__curv = 0;
      continue;
    }
    for (let i = 0; i < iface.length; i++) {
      const k = Math.floor(i / 2) + 1;
      const sign = i % 2 === 0 ? 1 : -1;
      iface[i].__curv = sign * k * base;
    }
  }
  return links;
}
