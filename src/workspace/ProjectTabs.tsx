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
    <div className="inline-flex border-b border-white/10">
      <Tab active={scope === "personal"} label="个人" onClick={() => onChange("personal")} />
      <Tab active={scope === "team"} label="团队项目" onClick={() => onChange("team")} />
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
      className={`relative h-12 px-1 pr-12 text-xl font-medium transition ${
        active ? "text-white" : "text-slate-500 hover:text-slate-200"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
      {active && <span className="absolute bottom-0 left-0 h-0.5 w-16 rounded-full bg-white" />}
    </button>
  );
}
