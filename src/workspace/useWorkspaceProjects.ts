import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createWorkspaceProject,
  listWorkspaceProjects,
  type WorkspaceProject,
} from "./workspaceApi";

type Scope = "personal" | "team";
type SortMode = "updated_desc" | "created_desc" | "name_asc";

export function useWorkspaceProjects() {
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("personal");
  const [sortMode, setSortMode] = useState<SortMode>("updated_desc");
  const [showAll, setShowAll] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProjects(await listWorkspaceProjects());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createProject = useCallback(
    async (input: { description?: string | null; name: string }) => {
      setCreating(true);
      setError(null);
      try {
        const result = await createWorkspaceProject(input);
        setProjects((current) => [result.project, ...current]);
        return result;
      } catch (createError) {
        setError(createError instanceof Error ? createError.message : "Unable to create project");
        throw createError;
      } finally {
        setCreating(false);
      }
    },
    [],
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

  return {
    createProject,
    creating,
    error,
    filteredProjects,
    loading,
    projects,
    query,
    refresh,
    scope,
    setQuery,
    setScope,
    setShowAll,
    setSortMode,
    showAll,
    sortMode,
  };
}
