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
    <div className="inline-flex w-fit rounded-full border border-white/10 bg-white/[0.04] p-1">
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
      className={`h-10 rounded-full px-5 text-sm font-semibold transition ${
        active ? "bg-white text-slate-950" : "text-slate-400 hover:text-white"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
