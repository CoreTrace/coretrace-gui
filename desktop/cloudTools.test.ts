import { describe, expect, it } from "vitest";
import { defaultTools, languagesOf, planFor } from "./cloudTools";

describe("languagesOf", () => {
  it("finds each language once, whatever the case of the extension", () => {
    expect(
      languagesOf(["src/main.c", "src/util.C", "include/util.h", "README.md"]),
    ).toEqual(["c"]);
  });

  it("tells C++ and Python apart from C", () => {
    expect(
      languagesOf(["engine/core.cpp", "engine/core.hpp", "tools/build.py"]),
    ).toEqual(["cpp", "python"]);
  });

  it("finds TypeScript and JavaScript", () => {
    expect(languagesOf(["web/app.tsx", "web/index.js", "build.mjs"])).toEqual([
      "javascript",
      "typescript",
    ]);
  });

  it("finds nothing in a folder without sources", () => {
    expect(
      languagesOf(["README.md", "Makefile", ".env", "docs/a.txt"]),
    ).toEqual([]);
  });

  it("does not read a hidden file's name as an extension", () => {
    expect(languagesOf([".py", "config/.c"])).toEqual([]);
  });
});

/** The catalogue as a plan sees it; `pro` says whether Pro tools are in it. */
function catalogue(pro: boolean) {
  return [
    { id: "ctrace", languages: ["c", "cpp"], entitled: true },
    { id: "stack-analyzer", languages: ["c", "cpp"], entitled: true },
    { id: "python-analyzer", languages: ["python"], entitled: true },
    { id: "python-analyzer-pro", languages: ["python"], entitled: pro },
    { id: "symprobe", languages: ["c", "cpp"], entitled: pro },
  ];
}

describe("defaultTools", () => {
  it("picks the tools that read the workspace's languages", () => {
    expect(defaultTools(catalogue(false), ["c"])).toEqual([
      "ctrace",
      "stack-analyzer",
    ]);
  });

  it("leaves out what the plan does not include", () => {
    expect(defaultTools(catalogue(false), ["cpp"])).not.toContain("symprobe");
    expect(defaultTools(catalogue(true), ["cpp"])).toContain("symprobe");
  });

  it("runs the Pro Python analyser in place of the standard one when the plan has it", () => {
    expect(defaultTools(catalogue(true), ["python"])).toEqual([
      "python-analyzer-pro",
    ]);
  });

  it("keeps the standard Python analyser when Pro is not in the plan", () => {
    expect(defaultTools(catalogue(false), ["python"])).toEqual([
      "python-analyzer",
    ]);
  });

  it("picks nothing for a folder without a language any tool reads", () => {
    expect(defaultTools(catalogue(true), [])).toEqual([]);
  });

  it("matches languages whatever their case", () => {
    expect(
      defaultTools(
        [{ id: "ctrace", languages: ["CPP"], entitled: true }],
        ["cpp"],
      ),
    ).toEqual(["ctrace"]);
  });
});

describe("planFor", () => {
  const plans = [
    { name: "Community", entitlements: ["ctrace"] },
    { name: "Pro", entitlements: ["ctrace", "stack"] },
    { name: "Enterprise", entitlements: ["ctrace", "stack", "symbolic"] },
  ];

  it("names the cheapest plan that includes the entitlement", () => {
    expect(planFor("stack", plans)).toBe("Pro");
    expect(planFor("symbolic", plans)).toBe("Enterprise");
  });

  it("names no plan for an entitlement none includes", () => {
    expect(planFor("unknown", plans)).toBeUndefined();
    expect(planFor("stack", [])).toBeUndefined();
  });
});
