// app/lib/graphKeys.js
export const idOf = (x) => (x && typeof x === "object" ? x.id : x);
export const linkKey = (l) => `${idOf(l.source)}->${idOf(l.target)}|${l.relation || "child_of"}`;

export function computeNodeType(n) {
  const label = String(n?.name || "").toLowerCase();
  if (label.includes(" function")) return "function";
  if (label.includes(" effect")) return "effect";
  if (label.includes(" cause")) return "cause";
  if (label.includes(" severity")) return "severity";
  if (label.includes(" occurrence")) return "occurrence";
  if (label.includes(" detection")) return "detection";
  if (label.includes(" interface")) return "interface";
  return "other";
}
