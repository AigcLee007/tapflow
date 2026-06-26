import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Dockerfile frontend env wiring", () => {
  it("passes VITE_AGENT_DIRECTOR_ENABLED into the frontend build stage", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");

    expect(dockerfile).toContain("ARG VITE_AGENT_DIRECTOR_ENABLED=false");
    expect(dockerfile).toContain("ENV VITE_AGENT_DIRECTOR_ENABLED=$VITE_AGENT_DIRECTOR_ENABLED");
    expect(dockerfile).toContain("RUN npm run build");
  });
});
