// app/lib/attribTypes.js

// Central palette + helpers for attribute types (UI styling concern)
export const TYPE_LIST = [
  "string",
  "int",
  "float",
  "number",
  "bool",
  "date",
  "timestamp",
  "other",
];

export const TYPE_CLASS = {
  string:    "bg-amber-500/20 text-amber-200 border-amber-200/30",
  int:       "bg-cyan-500/20 text-cyan-200 border-cyan-200/30",
  float:     "bg-sky-500/20 text-sky-200 border-sky-200/30",
  number:    "bg-blue-500/20 text-blue-200 border-blue-200/30",
  bool:      "bg-emerald-500/20 text-emerald-200 border-emerald-200/30",
  date:      "bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-200/30",
  timestamp: "bg-violet-500/20 text-violet-200 border-violet-200/30",
  other:     "bg-slate-500/20 text-slate-200 border-slate-200/30",
};

export const DEFAULT_TYPE = "string";

export function typeBadgeClass(t) {
  return TYPE_CLASS[t] || TYPE_CLASS.other;
}
