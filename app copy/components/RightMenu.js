"use client";

import React, { useEffect, useMemo, useState } from "react";
import { TYPE_LIST, typeBadgeClass, DEFAULT_TYPE } from "../lib/attribTypes";
import { computeNodeType as computeType } from "../lib/graphKeys";

const fmt = (t) => {
  try {
    const d = new Date(Number(t));
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()},  ${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return String(t ?? "");
  }
};

export default function RightMenu({
  open,
  kind,
  data,
  onClose,
  onSaveNode,
  onSaveLink,
}) {
  const computedType = useMemo(() => {
    if (!data || kind !== "node") return "other";
    if (data.__nodeType) return data.__nodeType;
    return computeType(data);
  }, [data, kind]);

  const [nodeType, setNodeType] = useState(computedType);
  const [relationType, setRelationType] = useState("child_of");
  const [attrs, setAttrs] = useState({});
  const [validUntil, setValidUntil] = useState("");

  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [newType, setNewType] = useState(DEFAULT_TYPE);

  useEffect(() => {
    if (!open) return;
    if (kind === "node" && data) {
      setNodeType(computedType);
      setAttrs(
        data.attributes && typeof data.attributes === "object"
          ? { ...data.attributes }
          : {}
      );
    } else if (kind === "link" && data) {
      setRelationType(data?.relation || "child_of");
      setAttrs(
        data.attributes && typeof data.attributes === "object"
          ? { ...data.attributes }
          : {}
      );
      setValidUntil(
        data.__validUntil === null || data.__validUntil === undefined
          ? ""
          : String(data.__validUntil)
      );
    } else {
      setAttrs({});
      setValidUntil("");
      setRelationType("child_of");
    }
    setNewKey("");
    setNewVal("");
    setNewType(DEFAULT_TYPE);
  }, [open, kind, data, computedType]);

  const addAttribute = (e) => {
    e?.preventDefault?.();
    const k = newKey.trim();
    if (!k) return;
    setAttrs((prev) => ({
      ...prev,
      [k]: { name: newVal, type: newType },
    }));
    setNewKey("");
    setNewVal("");
    setNewType(DEFAULT_TYPE);
  };

  const updateAttr = (k, patch) =>
    setAttrs((prev) => ({ ...prev, [k]: { ...(prev[k] || {}), ...patch } }));

  const deleteAttr = (k) =>
    setAttrs((prev) => {
      const n = { ...prev };
      delete n[k];
      return n;
    });

  const save = () => {
    if (kind === "node") onSaveNode?.({ attributes: attrs, nodeType });
    else if (kind === "link") onSaveLink?.({ attributes: attrs, validUntil: validUntil.trim() || null, relation: relationType });
  };

  const title =
    kind === "node"
      ? (data?.name || "Selected node")
      : kind === "link"
      ? "Selected relationship"
      : "";

  const containerClass = `
    fixed top-3 right-3 z-30
    w-[42rem] max-w-[98vw]
    max-h-[calc(100vh-24px)]
    overflow-y-auto
    rounded-lg bg-white/10 backdrop-blur-xl
    border border-white/20 p-3 shadow-2xl space-y-3
    transform transition-all duration-300 will-change-transform
    ${open ? "translate-x-0 opacity-100" : "translate-x-[120%] opacity-0"}
  `;

  const card = "rounded-lg border border-white/15 bg-white/[0.06] p-3 space-y-2.5";
  const label = "text-[9px] uppercase tracking-wider text-white/60 font-medium mb-1 block";
  const input =
    "w-full h-9 bg-slate-900/60 text-white text-sm placeholder:text-white/40 border border-white/15 rounded px-2.5 outline-none focus:ring-1 focus:ring-cyan-300 focus:border-cyan-300";
  const displayField =
    "w-full h-9 text-sm text-white/80 bg-slate-900/40 border border-white/10 rounded px-2.5 flex items-center";
  const select =
    "w-full h-9 text-white text-sm bg-slate-900 border border-white/15 rounded px-2.5 pr-8 outline-none focus:ring-1 focus:ring-cyan-300 focus:border-cyan-300 appearance-none cursor-pointer";
  const button =
    "h-9 px-3 text-sm rounded border border-white/20 text-white/90 hover:bg-white/10 transition font-medium";
  const pillBase =
    "inline-flex items-center justify-center h-9 px-2 rounded border text-xs font-medium";

  return (
    <aside className={containerClass} style={{ WebkitOverflowScrolling: "touch" }}>
      <style jsx>{`
        select option {
          background-color: #0f172a;
          color: #fff;
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between pb-1">
        <div>
          <div className="text-[9px] uppercase tracking-wider text-white/60 font-medium">
            {kind === "node" ? "Node details" : "Relationship details"}
          </div>
          <div className="text-lg font-semibold mt-0.5">
            <span className="bg-gradient-to-r from-yellow-300 via-orange-300 to-pink-300 bg-clip-text text-transparent">
              {title}
            </span>
          </div>
        </div>
        <button className="h-9 px-3 text-sm rounded bg-white/10 border border-white/20 hover:bg-white/20 transition font-medium" onClick={onClose}>
          Close
        </button>
      </div>

      {/* Top section: type + meta */}
      <div className={card}>
        {kind === "node" ? (
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className={label}>Type</label>
              <div className="relative">
                <select
                  className={select}
                  value={nodeType}
                  onChange={(e) => setNodeType(e.target.value)}
                >
                  {["function","effect","cause","occurrence","detection","severity","interface","other"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-white/60 text-xs">▾</span>
              </div>
            </div>
            <div>
              <label className={label}>ID</label>
              <div className={displayField}>
                {data?.id ?? ""}
              </div>
            </div>
            <div>
              <label className={label}>Created</label>
              <div className={displayField + " truncate"}>
                {fmt(data?.__createdAt)}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={label}>Relation</label>
              <div className="relative">
                <select
                  className={select}
                  value={relationType}
                  onChange={(e) => setRelationType(e.target.value)}
                >
                  <option value="child_of">child_of</option>
                  <option value="parent_of">parent_of</option>
                  <option value="causes">causes</option>
                  <option value="caused_by">caused_by</option>
                  <option value="detects">detects</option>
                  <option value="detected_by">detected_by</option>
                  <option value="mitigates">mitigates</option>
                  <option value="mitigated_by">mitigated_by</option>
                  <option value="related_to">related_to</option>
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-white/60 text-xs">▾</span>
              </div>
            </div>
            <div>
              <label className={label}>Created</label>
              <div className={displayField + " truncate"}>
                {fmt(data?.__createdAt)}
              </div>
            </div>
            <div>
              <label className={label}>Source</label>
              <div className={displayField + " truncate"}>
                {typeof data?.source === "object" ? data?.source?.id : data?.source}
              </div>
            </div>
            <div>
              <label className={label}>Target</label>
              <div className={displayField + " truncate"}>
                {typeof data?.target === "object" ? data?.target?.id : data?.target}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Attributes */}
      <div className={card}>
        <div className="text-[9px] uppercase tracking-wider text-white/60 font-medium">Attributes</div>

        {/* existing attributes list */}
        <div className="space-y-2">
          {Object.keys(attrs).length === 0 && (
            <div className="text-xs text-white/50 py-2">No attributes yet.</div>
          )}

          {Object.entries(attrs).map(([k, v]) => {
            const t = v?.type || DEFAULT_TYPE;
            return (
              <div key={k} className="grid grid-cols-[1fr_1.3fr_7rem_5rem] gap-2 items-center">
                <input
                  className={input + " text-xs bg-slate-900/40"}
                  value={k}
                  readOnly
                  title="Attribute key"
                />
                <input
                  className={input}
                  value={v?.name ?? ""}
                  onChange={(e) => updateAttr(k, { name: e.target.value })}
                  placeholder="value"
                />
                <div className={`${pillBase} ${typeBadgeClass(t)}`}>
                  {t}
                </div>
                <button
                  className="h-9 px-2.5 text-xs rounded bg-rose-500/20 text-rose-100 border border-rose-300/30 hover:bg-rose-500/30 transition font-medium"
                  onClick={() => deleteAttr(k)}
                  title="Delete attribute"
                >
                  Delete
                </button>
              </div>
            );
          })}
        </div>

        {/* add bar */}
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="grid grid-cols-[1fr_1.3fr_7rem_5rem] gap-2 items-center">
            <input
              className={input}
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="key"
            />
            <input
              className={input}
              value={newVal}
              onChange={(e) => setNewVal(e.target.value)}
              placeholder="value"
            />
            <div className="relative">
              <select
                className={select}
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
              >
                {TYPE_LIST.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-white/60 text-xs">▾</span>
            </div>
            <button
              className="h-9 px-2.5 text-xs rounded bg-emerald-500/20 text-emerald-100 border border-emerald-300/30 hover:bg-emerald-500/30 transition font-medium"
              onClick={addAttribute}
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Relationship metadata */}
      {kind === "link" && (
        <div className={card}>
          <div>
            <label className={label}>Valid until</label>
            <input
              className={input}
              placeholder="Empty = infinite"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
            <div className="text-[10px] text-white/40 mt-1.5">Empty = infinite</div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button className={button} onClick={onClose}>
          Close
        </button>
        <button
          className="h-9 px-4 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-500 transition font-medium focus:ring-1 focus:ring-emerald-300"
          onClick={save}
        >
          Save
        </button>
      </div>
    </aside>
  );
}