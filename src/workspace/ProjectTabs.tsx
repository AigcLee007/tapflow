import React from "react";

type Scope = "personal" | "team";

export function ProjectTabs({
  scope,
  onChange,
}: {
  onChange: (scope: Scope) => void;
  scope: Scope;
}) {
  return (
    <div className="inline-flex rounded-lg border border-white/10 bg-black/20 p-1">
      <Tab active={scope === "personal"} label="我的" onClick={() => onChange("personal")} />
      <Tab active={scope === "team"} label="团队" onClick={() => onChange("team")} />
    </div>
  );
}

function Tab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`h-9 rounded-md px-4 text-sm transition ${
        active ? "bg-white text-slate-950" : "text-slate-400 hover:text-white"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
