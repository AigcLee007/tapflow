import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../auth/useAuth";
import { markMeasure, markNow } from "../performance/performanceMarks";
import {
  getWorkspaceProjectsSnapshot,
  setWorkspaceProjectsSnapshot,
} from "./workspaceSessionCache";
import {
  createWorkspaceProject,
  listWorkspaceProjects,
  type WorkspaceProject,
} from "./workspaceApi";

type Scope = "personal" | "team";
type SortMode = "updated_desc" | "created_desc" | "name_asc";

export function useWorkspaceProjects() {
  const { authenticated, sessionId, tenant, user } = useAuth();
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("personal");
  const [sortMode, setSortMode] = useState<SortMode>("updated_desc");
  const [showAll, setShowAll] = useState(true);
  const requestSequenceRef = useRef(0);

  const identityKey = useMemo(
    () => (authenticated && tenant && user ? `${user.id}:${tenant.id}:${sessionId ?? "none"}` : "anonymous"),
    [authenticated, sessionId, tenant, user],
  );

  useEffect(() => {
    requestSequenceRef.current += 1;
    setError(null);
    if (!authenticated || !tenant || !user) {
      setProjects([]);
      setLoading(false);
      return;
    }

    const snapshot = getWorkspaceProjectsSnapshot(identityKey);
    if (snapshot) {
      setProjects(snapshot.projects);
      setLoading(false);
      return;
    }

    setProjects([]);
    setLoading(true);
  }, [authenticated, identityKey, tenant, user]);

  const refresh = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!authenticated || !tenant || !user) {
      requestSequenceRef.current += 1;
      if (!options.silent) {
        setProjects([]);
      }
      setError(null);
      setLoading(false);
      return;
    }

    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    markNow("workspace-projects-refresh-start");
    if (!options.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const nextProjects = await listWorkspaceProjects({ includeCoverUrl: true });
      if (requestSequenceRef.current !== requestId) {
        return;
      }
      setProjects(nextProjects);
      setWorkspaceProjectsSnapshot(identityKey, {
        projects: nextProjects,
        staleAt: Date.now() + 30_000,
      });
    } catch (loadError) {
      if (requestSequenceRef.current !== requestId) {
        return;
      }
      setProjects([]);
      setError(loadError instanceof Error ? loadError.message : "项目加载失败，请稍后重试。");
    } finally {
      if (requestSequenceRef.current === requestId) {
        markNow("workspace-projects-refresh-end");
        markMeasure("workspace-projects-refresh", "workspace-projects-refresh-start", "workspace-projects-refresh-end");
        setLoading(false);
      }
    }
  }, [authenticated, identityKey, tenant, user]);

  useEffect(() => {
    const hasSnapshot = Boolean(authenticated && tenant && user && getWorkspaceProjectsSnapshot(identityKey));
    void refresh({ silent: hasSnapshot });
  }, [authenticated, identityKey, refresh, tenant, user]);

  const createProject = useCallback(
    async (input: { description?: string | null; name: string }) => {
      if (!authenticated || !tenant || !user) {
        throw new Error("请先重新登录后再创建项目。");
      }
      setCreating(true);
      setError(null);
      try {
        const result = await createWorkspaceProject(input);
        setProjects((current) => [result.project, ...current]);
        return result;
      } catch (createError) {
        setError(createError instanceof Error ? createError.message : "创建项目失败，请稍后重试。");
        throw createError;
      } finally {
        setCreating(false);
      }
    },
    [authenticated, tenant, user],
  );

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = projects.filter((project) => {
      if (!showAll && project.description === null) return false;
      if (!normalizedQuery) return true;
      return [project.name, project.description ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === "name_asc") {
        return a.name.localeCompare(b.name);
      }
      const left = new Date(sortMode === "created_desc" ? a.createdAt : a.updatedAt).getTime();
      const right = new Date(sortMode === "created_desc" ? b.createdAt : b.updatedAt).getTime();
      return right - left;
    });
  }, [projects, query, showAll, sortMode]);

  const removeProjectOptimistically = useCallback(
    async (projectId: string, action: () => Promise<void>) => {
      const previousProjects = projects;
      setProjects((current) => current.filter((project) => project.id !== projectId));
      setError(null);
      try {
        await action();
        void refresh({ silent: true });
      } catch (deleteError) {
        setProjects(previousProjects);
        setError(deleteError instanceof Error ? deleteError.message : "删除项目失败，请稍后重试。");
        throw deleteError;
      }
    },
    [projects, refresh],
  );

  return {
    createProject,
    creating,
    error,
    filteredProjects,
    loading,
    projects,
    query,
    refresh,
    removeProjectOptimistically,
    scope,
    setQuery,
    setScope,
    setShowAll,
    setSortMode,
    showAll,
    sortMode,
  };
}
