import React, { useEffect, useMemo, useState } from "react";
import { LayoutTemplate, LoaderCircle, Search } from "lucide-react";

import { listFlowTemplates, type FlowTemplateItem } from "../../services/v2FlowTemplatesApi";
import { CanvasDockEmptyState } from "./CanvasDockDrawer";

const TEMPLATE_CATEGORIES = [
  { key: "", label: "全部" },
  { key: "image", label: "图片" },
  { key: "video", label: "视频" },
  { key: "character", label: "角色" },
  { key: "product", label: "商品" },
  { key: "storyboard", label: "分镜" },
];

export function CanvasTemplatePanel({
  onInsertTemplate,
}: {
  onInsertTemplate: (templateId: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [templates, setTemplates] = useState<FlowTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insertingId, setInsertingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void listFlowTemplates({
      category: category || undefined,
      query: query.trim() || undefined,
    })
      .then((result) => {
        if (!active) return;
        setTemplates(result.items);
      })
      .catch((reason) => {
        if (!active) return;
        setTemplates([]);
        setError(reason instanceof Error ? reason.message : "模板列表加载失败，请稍后重试。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [category, query]);

  const titleCount = useMemo(() => templates.length, [templates.length]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label style={{ position: "relative", display: "block" }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: 9, color: "#71717a" }} />
        <input
          className="nodrag nopan"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索模板"
          style={{
            width: "100%",
            height: 32,
            borderRadius: 11,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.055)",
            color: "#f8fafc",
            fontSize: 12,
            outline: "none",
            padding: "0 10px 0 30px",
          }}
        />
      </label>

      <div className="sleek-scroll-x" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        {TEMPLATE_CATEGORIES.map((item) => (
          <button
            key={item.key || "all"}
            type="button"
            className="nodrag nopan"
            onClick={() => setCategory(item.key)}
            style={categoryChip(category === item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div style={{ color: "#71717a", fontSize: 11, fontWeight: 600 }}>{titleCount} 个模板</div>

      {loading ? <CanvasDockEmptyState message="正在加载模板..." /> : null}
      {error ? <CanvasDockEmptyState message={error} /> : null}
      {!loading && !error && templates.length === 0 ? (
        <CanvasDockEmptyState message="当前筛选下还没有模板，后续可以继续补官方模板和租户模板。" />
      ) : null}

      {!loading && !error && templates.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {templates.map((template) => {
            const inserting = insertingId === template.id;
            return (
              <div
                key={template.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.04)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      display: "grid",
                      placeItems: "center",
                      background: "rgba(255,255,255,0.06)",
                      color: "#d4d4d8",
                      flexShrink: 0,
                    }}
                  >
                    <LayoutTemplate size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#f8fafc", fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>
                      {template.title}
                    </div>
                    <div style={{ color: "#a1a1aa", fontSize: 11, lineHeight: 1.45, marginTop: 3 }}>
                      {template.description || "暂无模板描述"}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={metaPillStyle}>{template.category || "general"}</span>
                    <span style={metaPillStyle}>{template.nodeCount} 节点</span>
                    <span style={metaPillStyle}>{template.visibility}</span>
                  </div>
                  <button
                    type="button"
                    className="nodrag nopan"
                    disabled={inserting}
                    onClick={() => {
                      setInsertingId(template.id);
                      void onInsertTemplate(template.id).finally(() =>
                        setInsertingId((current) => (current === template.id ? null : current)),
                      );
                    }}
                    style={{
                      height: 28,
                      minWidth: 64,
                      border: "none",
                      borderRadius: 9,
                      background: "rgba(255,255,255,0.92)",
                      color: "#09090b",
                      fontSize: 12,
                      fontWeight: 700,
                      padding: "0 12px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      cursor: inserting ? "default" : "pointer",
                      opacity: inserting ? 0.72 : 1,
                    }}
                  >
                    {inserting ? <LoaderCircle size={13} style={{ animation: "spin 1s linear infinite" }} /> : null}
                    {inserting ? "插入中" : "插入"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function categoryChip(active: boolean): React.CSSProperties {
  return {
    height: 26,
    border: "none",
    borderRadius: 999,
    background: active ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.055)",
    color: active ? "#fff" : "#a1a1aa",
    fontSize: 11,
    fontWeight: 650,
    padding: "0 10px",
    whiteSpace: "nowrap",
    cursor: "pointer",
  };
}

const metaPillStyle: React.CSSProperties = {
  height: 22,
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  background: "rgba(255,255,255,0.055)",
  color: "#a1a1aa",
  fontSize: 10,
  fontWeight: 650,
  padding: "0 8px",
};
