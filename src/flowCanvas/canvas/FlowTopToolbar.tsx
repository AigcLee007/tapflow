/**
 * TapNow-style minimal canvas chrome.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CheckCheck,
  ChevronRight,
  Megaphone,
  Plus,
  RefreshCw,
  Share2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { WORKSPACE_ROUTE, getProjectId } from "../../app/routes";
import { BrandMark } from "../../app/brand/BrandMark";
import { getBillingSummary } from "../../billing/billingApi";
import { MenuSurface } from "../../components/menu/MenuSurface";
import { MENU_DIVIDER_CLASS, MENU_ITEM_CLASS, MENU_ITEM_PRIMARY_CLASS } from "../../components/menu/menuStyles";
import { useDismissibleLayer } from "../../components/menu/useDismissibleLayer";
import { getStoredAccessToken, V2_AUTH_CHANGE_EVENT } from "../../services/v2HttpClient";
import { formatPoint } from "../../utils/pointFormat";
import { createWorkspaceProject, deleteWorkspaceProject, updateWorkspaceProject } from "../../workspace/workspaceApi";
import type { CanvasSaveStatusView } from "../FlowCanvasPage";
import { useFlowCanvasStore } from "../store/flowCanvasStore";

const formatToolbarPoint = (value: number) => formatPoint(value).replace(/\.0$/, "");
const SEEN_STORAGE_KEY = "seen_announcement_ids";

interface Announcement {
  active: boolean;
  content: string;
  date: string;
  id: string;
  images?: string[];
  pinned?: boolean;
  title: string;
}

const readSeenAnnouncementIds = (): string[] => {
  try {
    const raw = window.localStorage.getItem(SEEN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item));
  } catch {
    return [];
  }
};

const writeSeenAnnouncementIds = (ids: string[]) => {
  try {
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(Array.from(new Set(ids))));
  } catch {}
};

const formatAnnouncementDate = (input?: string) => {
  if (!input) return "";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString();
};

function navigate(path: string) {
  if (typeof window === "undefined") return;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export const FlowTopToolbar: React.FC<{
  cullingEnabled: boolean;
  onToggleCulling: () => void;
  saveStatus?: CanvasSaveStatusView;
}> = memo(function FlowTopToolbar({ saveStatus }) {
  const projectTitle = useFlowCanvasStore((s) => s.projectTitle);
  const setProjectTitle = useFlowCanvasStore((s) => s.setProjectTitle);
  const [points, setPoints] = useState(0);
  const [pointsLoading, setPointsLoading] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [seenIds, setSeenIds] = useState<string[]>(() => readSeenAnnouncementIds());
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [projectMenuBusy, setProjectMenuBusy] = useState<"create" | "delete" | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const projectMenuLayer = useDismissibleLayer("canvas-toolbar-project");
  const notificationLayer = useDismissibleLayer("canvas-toolbar-notifications");
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const projectId = typeof window === "undefined" ? null : getProjectId(window.location.pathname);

  const refreshPoints = useCallback(async () => {
    if (!getStoredAccessToken()) {
      setPoints(0);
      setPointsLoading(false);
      return;
    }

    setPointsLoading(true);
    try {
      const data = await getBillingSummary();
      setPoints(data.account.balanceCents);
    } catch {
      setPoints(0);
    } finally {
      setPointsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPoints();

    if (typeof window === "undefined") return;
    window.addEventListener(V2_AUTH_CHANGE_EVENT, refreshPoints);
    window.addEventListener("storage", refreshPoints);
    return () => {
      window.removeEventListener(V2_AUTH_CHANGE_EVENT, refreshPoints);
      window.removeEventListener("storage", refreshPoints);
    };
  }, [refreshPoints]);

  const refreshAnnouncements = useCallback(async () => {
    try {
      const response = await fetch("/api/announcements?page=1&pageSize=50");
      if (!response.ok) {
        setAnnouncements([]);
        return;
      }
      const data = await response.json().catch(() => ({}));
      const list: Announcement[] = Array.isArray(data?.items) ? data.items : [];
      setAnnouncements(list.filter((item) => item?.active && item?.content));
    } catch {
      setAnnouncements([]);
    }
  }, []);

  useEffect(() => {
    void refreshAnnouncements();
  }, [refreshAnnouncements]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedAnnouncement(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const unreadIds = useMemo(
    () => announcements.filter((item) => !seenIds.includes(item.id)).map((item) => item.id),
    [announcements, seenIds],
  );

  const markAnnouncementsRead = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      const next = Array.from(new Set([...seenIds, ...ids.map((id) => String(id))]));
      setSeenIds(next);
      writeSeenAnnouncementIds(next);
    },
    [seenIds],
  );

  const openAnnouncement = (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);
    markAnnouncementsRead([announcement.id]);
  };

  const markAllRead = () => {
    markAnnouncementsRead(announcements.map((item) => item.id));
  };

  const copyShareLink = () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    void navigator.clipboard?.writeText(url).catch(() => undefined);
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 1500);
  };

  const focusTitleInput = useCallback(() => {
    projectMenuLayer.closeLayer();
    window.setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 0);
  }, [projectMenuLayer]);

  const handleTitleBlur = useCallback(async () => {
    const normalizedTitle = (projectTitle || "").trim() || "未命名项目";
    if (normalizedTitle !== projectTitle) {
      setProjectTitle(normalizedTitle);
    }
    if (!projectId) return;
    try {
      await updateWorkspaceProject(projectId, { name: normalizedTitle });
    } catch {}
  }, [projectId, projectTitle, setProjectTitle]);

  const handleCreateProject = useCallback(async () => {
    if (projectMenuBusy) return;
    setProjectMenuBusy("create");
    try {
      const result = await createWorkspaceProject({ name: "未命名项目" });
      projectMenuLayer.closeLayer();
      navigate(`/projects/${result.project.id}`);
    } finally {
      setProjectMenuBusy(null);
    }
  }, [projectMenuBusy, projectMenuLayer]);

  const handleDeleteProject = useCallback(async () => {
    if (!projectId || projectMenuBusy) return;
    if (!window.confirm("删除后项目和画布将无法恢复，确认删除吗？")) return;
    setProjectMenuBusy("delete");
    try {
      await deleteWorkspaceProject(projectId);
      projectMenuLayer.closeLayer();
      navigate(WORKSPACE_ROUTE);
    } finally {
      setProjectMenuBusy(null);
    }
  }, [projectId, projectMenuBusy, projectMenuLayer]);

  return (
    <div className="nodrag nopan nowheel" style={topChromeStyle}>
      <div style={titleMenuHostStyle}>
        <div style={titleClusterStyle}>
          <button
            type="button"
            ref={projectMenuLayer.triggerRef as React.RefObject<HTMLButtonElement>}
            aria-expanded={projectMenuLayer.open}
            aria-haspopup="menu"
            aria-label="打开项目菜单"
            onClick={projectMenuLayer.toggle}
            style={brandMenuButtonStyle}
          >
            <BrandMark size="canvas" showCaption={false} />
          </button>

          <div style={titleTextWrapStyle}>
            <input
              ref={titleInputRef}
              value={projectTitle || "未命名项目"}
              onBlur={() => void handleTitleBlur()}
              onChange={(event) => setProjectTitle(event.target.value)}
              style={titleInputStyle}
              spellCheck={false}
              aria-label="项目名称"
            />
            <div style={saveStatusStyle(saveStatus?.status)}>
              {saveStatus?.icon}
              <span>{saveStatus?.label || "已保存到云端"}</span>
              {saveStatus?.status === "failed" && saveStatus.onRetry ? (
                <button
                  type="button"
                  style={saveRetryButtonStyle}
                  title={saveStatus.error || "重试同步"}
                  onClick={saveStatus.onRetry}
                >
                  <RefreshCw size={12} />
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {projectMenuLayer.open ? (
          <MenuSurface
            ref={projectMenuLayer.ref as React.RefObject<HTMLDivElement>}
            role="menu"
            aria-label="项目菜单"
            className="w-[296px] max-w-[calc(100vw-120px)] p-3"
            style={projectMenuStyle}
          >
            <button
              type="button"
              role="menuitem"
              className={`${MENU_ITEM_CLASS} min-h-[38px] justify-between`}
              onClick={() => {
                projectMenuLayer.closeLayer();
                navigate(WORKSPACE_ROUTE);
              }}
            >
              <span className={MENU_ITEM_PRIMARY_CLASS}>返回工作空间</span>
              <ChevronRight size={16} />
            </button>

            <div className={MENU_DIVIDER_CLASS} />

            <button type="button" role="menuitem" className={`${MENU_ITEM_CLASS} min-h-[38px]`} onClick={focusTitleInput}>
              <span className={MENU_ITEM_PRIMARY_CLASS}>重命名项目</span>
            </button>

            <button
              type="button"
              role="menuitem"
              className={`${MENU_ITEM_CLASS} min-h-[38px]`}
              onClick={() => void handleCreateProject()}
              disabled={projectMenuBusy === "create"}
            >
              <span style={projectMenuLabelWithIconStyle}>
                <Plus size={16} />
                <span className={MENU_ITEM_PRIMARY_CLASS}>{projectMenuBusy === "create" ? "正在创建..." : "新建项目"}</span>
              </span>
            </button>

            <div className={MENU_DIVIDER_CLASS} />

            <button
              type="button"
              role="menuitem"
              className={`${MENU_ITEM_CLASS} min-h-[38px] text-red-200 hover:bg-red-500/15`}
              onClick={() => void handleDeleteProject()}
              disabled={!projectId || projectMenuBusy === "delete"}
            >
              <span style={projectMenuLabelWithIconStyle}>
                <Trash2 size={16} />
                <span className={MENU_ITEM_PRIMARY_CLASS}>{projectMenuBusy === "delete" ? "正在删除..." : "删除项目"}</span>
              </span>
            </button>
          </MenuSurface>
        ) : null}
      </div>

      <div style={rightClusterStyle}>
        <button type="button" style={topPillStyle} title="当前点数">
          <Sparkles size={17} />
          <span>{pointsLoading ? "..." : formatToolbarPoint(points)}</span>
        </button>

        <div style={notificationHostStyle}>
          <button
            type="button"
            ref={notificationLayer.triggerRef as React.RefObject<HTMLButtonElement>}
            style={topPillStyle}
            aria-expanded={notificationLayer.open}
            aria-haspopup="menu"
            aria-label="通知"
            title="通知"
            onClick={() => {
              notificationLayer.toggle();
              void refreshAnnouncements();
            }}
          >
            <Bell size={17} />
            <span>通知</span>
            {unreadIds.length > 0 ? (
              <span style={notificationBadgeStyle}>{unreadIds.length > 99 ? "99+" : unreadIds.length}</span>
            ) : null}
          </button>

          {notificationLayer.open ? (
            <MenuSurface
              ref={notificationLayer.ref as React.RefObject<HTMLDivElement>}
              role="menu"
              aria-label="通知菜单"
              className="absolute right-0 top-[calc(100%+14px)] w-[370px] max-w-[calc(100vw-48px)] overflow-hidden p-0"
            >
              <div style={notificationHeaderStyle}>
                <div style={notificationHeaderTitleStyle}>
                  <Megaphone size={17} color="#93c5fd" />
                  <span>通知</span>
                </div>
                <button
                  type="button"
                  style={markReadButtonStyle}
                  onClick={markAllRead}
                  disabled={announcements.length === 0}
                >
                  <CheckCheck size={13} />
                  全部已读
                </button>
              </div>

              <div style={notificationListStyle}>
                {announcements.length === 0 ? (
                  <div style={emptyNotificationStyle}>暂无公告</div>
                ) : (
                  announcements.map((item) => {
                    const unread = !seenIds.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        style={notificationItemStyle}
                        onClick={() => openAnnouncement(item)}
                      >
                        <span style={notificationItemContentStyle}>
                          <span style={notificationItemTitleStyle}>{item.title || "系统公告"}</span>
                          {item.pinned ? <span style={pinnedStyle}>置顶</span> : null}
                          <span style={notificationItemTextStyle}>{item.content}</span>
                          <span style={notificationDateStyle}>{formatAnnouncementDate(item.date)}</span>
                        </span>
                        {unread ? <span style={unreadDotStyle} /> : null}
                      </button>
                    );
                  })
                )}
              </div>
            </MenuSurface>
          ) : null}
        </div>

        <button
          type="button"
          style={shareButtonStyle}
          title={shareCopied ? "已复制链接" : "分享"}
          onClick={copyShareLink}
        >
          <Share2 size={17} />
        </button>
      </div>

      {selectedAnnouncement ? (
        <div style={announcementOverlayStyle} onMouseDown={() => setSelectedAnnouncement(null)}>
          <div style={announcementModalStyle} onMouseDown={(event) => event.stopPropagation()}>
            <div style={announcementModalHeaderStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <span style={announcementIconStyle}>
                  <Megaphone size={20} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={announcementTitleStyle}>{selectedAnnouncement.title || "系统公告"}</div>
                  <div style={announcementDateModalStyle}>{formatAnnouncementDate(selectedAnnouncement.date)}</div>
                </div>
              </div>
              <button type="button" style={modalCloseButtonStyle} onClick={() => setSelectedAnnouncement(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={announcementBodyStyle}>{selectedAnnouncement.content}</div>

            {!!selectedAnnouncement.images?.length ? (
              <div style={announcementImagesStyle}>
                {selectedAnnouncement.images.map((src, index) => (
                  <img key={`${src}-${index}`} src={src} alt={`announcement-${index + 1}`} style={announcementImageStyle} />
                ))}
              </div>
            ) : null}

            <div style={announcementFooterStyle}>
              <button type="button" style={confirmButtonStyle} onClick={() => setSelectedAnnouncement(null)}>
                我知道了
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});

const topChromeStyle: React.CSSProperties = {
  position: "fixed",
  left: 18,
  right: 18,
  top: 16,
  zIndex: 900,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  pointerEvents: "none",
};

const titleMenuHostStyle: React.CSSProperties = {
  position: "relative",
  pointerEvents: "auto",
  minWidth: 0,
  maxWidth: "min(520px, calc(100vw - 520px))",
};

const titleClusterStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  minWidth: 0,
};

const brandMenuButtonStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  padding: 0,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
};

const titleTextWrapStyle: React.CSSProperties = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 3,
};

const titleInputStyle: React.CSSProperties = {
  width: "min(300px, calc(100vw - 540px))",
  minWidth: 112,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "#fff",
  fontSize: 20,
  fontWeight: 820,
  lineHeight: 1,
  padding: 0,
  textShadow: "0 2px 16px rgba(0,0,0,0.5)",
};

const projectMenuLabelWithIconStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const projectMenuStyle: React.CSSProperties = {
  position: "fixed",
  left: 96,
  top: 118,
  zIndex: 1800,
};

const saveStatusStyle = (status?: string): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 5,
  color:
    status === "failed"
      ? "rgba(251,191,36,0.86)"
      : status === "saved"
        ? "rgba(156,163,175,0.78)"
        : "rgba(125,211,252,0.86)",
  fontSize: 12,
  fontWeight: 520,
  lineHeight: 1,
});

const saveRetryButtonStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: "50%",
  border: "1px solid rgba(251,191,36,0.28)",
  background: "rgba(251,191,36,0.1)",
  color: "#fde68a",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  padding: 0,
};

const rightClusterStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  pointerEvents: "auto",
};

const topPillStyle: React.CSSProperties = {
  height: 42,
  border: "none",
  borderRadius: 16,
  padding: "0 14px",
  display: "flex",
  alignItems: "center",
  gap: 7,
  background: "rgba(43,43,49,0.96)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 820,
  cursor: "pointer",
  boxShadow: "0 12px 34px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.06)",
};

const shareButtonStyle: React.CSSProperties = {
  width: 42,
  height: 42,
  border: "none",
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "rgba(43,43,49,0.96)",
  color: "#fff",
  cursor: "pointer",
  boxShadow: "0 12px 34px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.06)",
};

const notificationHostStyle: React.CSSProperties = {
  position: "relative",
};

const notificationBadgeStyle: React.CSSProperties = {
  minWidth: 20,
  height: 20,
  borderRadius: 999,
  padding: "0 6px",
  display: "grid",
  placeItems: "center",
  background: "#ef4444",
  color: "#fff",
  fontSize: 11,
  fontWeight: 850,
  lineHeight: 1,
  boxShadow: "0 0 0 2px rgba(43,43,49,0.96), 0 0 14px rgba(239,68,68,0.78)",
};

const notificationHeaderStyle: React.CSSProperties = {
  height: 54,
  padding: "0 14px 0 16px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const notificationHeaderTitleStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  color: "#fff",
  fontSize: 15,
  fontWeight: 780,
};

const markReadButtonStyle: React.CSSProperties = {
  height: 32,
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  background: "rgba(255,255,255,0.055)",
  color: "#d1d5db",
  padding: "0 10px",
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const notificationListStyle: React.CSSProperties = {
  maxHeight: "62vh",
  overflowY: "auto",
};

const emptyNotificationStyle: React.CSSProperties = {
  padding: "44px 16px",
  textAlign: "center",
  color: "rgba(255,255,255,0.45)",
  fontSize: 14,
};

const notificationItemStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  border: "none",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  background: "transparent",
  color: "#fff",
  padding: "14px 18px",
  display: "flex",
  alignItems: "center",
  gap: 12,
  textAlign: "left",
  cursor: "pointer",
};

const notificationItemContentStyle: React.CSSProperties = {
  minWidth: 0,
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const notificationItemTitleStyle: React.CSSProperties = {
  color: "#f8fafc",
  fontSize: 14,
  fontWeight: 800,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const pinnedStyle: React.CSSProperties = {
  alignSelf: "flex-start",
  borderRadius: 999,
  background: "rgba(245,158,11,0.16)",
  color: "#fbbf24",
  padding: "2px 7px",
  fontSize: 10,
  fontWeight: 750,
};

const notificationItemTextStyle: React.CSSProperties = {
  color: "rgba(209,213,219,0.78)",
  fontSize: 12,
  lineHeight: 1.55,
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const notificationDateStyle: React.CSSProperties = {
  color: "rgba(148,163,184,0.62)",
  fontSize: 11,
};

const unreadDotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "#60a5fa",
  boxShadow: "0 0 10px rgba(96,165,250,0.85)",
  flexShrink: 0,
};

const announcementOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1300,
  background: "rgba(0,0,0,0.62)",
  backdropFilter: "blur(6px)",
  display: "grid",
  placeItems: "center",
  pointerEvents: "auto",
  padding: 24,
};

const announcementModalStyle: React.CSSProperties = {
  width: "min(520px, calc(100vw - 32px))",
  maxHeight: "86vh",
  overflow: "hidden",
  borderRadius: 22,
  background: "rgba(24,24,27,0.98)",
  border: "1px solid rgba(245,158,11,0.22)",
  boxShadow: "0 32px 86px rgba(0,0,0,0.65)",
};

const announcementModalHeaderStyle: React.CSSProperties = {
  padding: "18px 18px 16px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  borderBottom: "1px solid rgba(255,255,255,0.07)",
  background: "linear-gradient(90deg, rgba(245,158,11,0.12), transparent)",
};

const announcementIconStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  display: "grid",
  placeItems: "center",
  background: "rgba(245,158,11,0.12)",
  color: "#f59e0b",
  flexShrink: 0,
};

const announcementTitleStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: 16,
  fontWeight: 820,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const announcementDateModalStyle: React.CSSProperties = {
  marginTop: 4,
  color: "rgba(209,213,219,0.58)",
  fontSize: 12,
};

const modalCloseButtonStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  border: "none",
  borderRadius: 10,
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.72)",
  cursor: "pointer",
  flexShrink: 0,
};

const announcementBodyStyle: React.CSSProperties = {
  maxHeight: "38vh",
  overflowY: "auto",
  padding: "18px 20px",
  color: "#d4d4d8",
  fontSize: 14,
  lineHeight: 1.75,
  whiteSpace: "pre-wrap",
};

const announcementImagesStyle: React.CSSProperties = {
  maxHeight: "26vh",
  overflowY: "auto",
  padding: "0 20px 18px",
  display: "grid",
  gap: 10,
};

const announcementImageStyle: React.CSSProperties = {
  width: "100%",
  maxHeight: 240,
  objectFit: "contain",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(0,0,0,0.25)",
};

const announcementFooterStyle: React.CSSProperties = {
  padding: "14px 18px 18px",
  display: "flex",
  justifyContent: "flex-end",
  borderTop: "1px solid rgba(255,255,255,0.06)",
};

const confirmButtonStyle: React.CSSProperties = {
  height: 38,
  border: "none",
  borderRadius: 12,
  background: "#f59e0b",
  color: "#111827",
  padding: "0 18px",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
};
