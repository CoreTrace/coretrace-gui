import { describe, expect, it } from "vitest";
import {
  billed,
  duration,
  outcome,
  parseFindings,
  terminal,
  usage,
  workspaceRelativePath,
} from "./model";
import type { Job, Limits } from "./types";

describe("platform projections", () => {
  it("never invents period spend from policy ceilings or missing fields", () => {
    const limits = {
      remaining_budget_ctu: 50,
      monthly_budget_ctu: 500,
    } as Limits;
    expect(usage(limits)).toEqual({
      remaining: 50,
      allowance: undefined,
      used: undefined,
    });
    expect(
      usage({ ...limits, period_used_ctu: 12, period_allowance_ctu: 100 }),
    ).toEqual({ remaining: 50, used: 12, allowance: 100 });
  });
  it("keeps capped and refused outcomes distinct from successful analyses", () => {
    expect(outcome({ status: "completed", conclusion: "capped" } as Job)).toBe(
      "Plafond atteint",
    );
    expect(outcome({ status: "rejected" } as Job)).toBe("Refusée");
    expect(terminal({ status: "preparing" } as Job)).toBe(false);
  });
  it("only displays settled cost and completed tool durations", () => {
    const job = {
      runs: [
        {
          billed_ctu: 10,
          reserved_ctu: 99,
          started_at: "2026-01-01T00:00:00Z",
          finished_at: "2026-01-01T00:00:12Z",
        },
        {
          billed_ctu: 3,
          reserved_ctu: 300,
          started_at: "2026-01-01T00:00:02Z",
          finished_at: "2026-01-01T00:00:14Z",
        },
      ],
    } as Job;
    expect(billed(job)).toBe(13);
    expect(duration(job)).toBe("14 s");
    delete job.runs[1].finished_at;
    expect(duration(job)).toBe("—");
  });
});
describe("report decoding", () => {
  it("reports unreadable artifacts instead of showing a clean result", () => {
    expect(() => parseFindings("not a report")).toThrow("Rapport illisible");
    expect(() => parseFindings('{"unknown":true}')).toThrow(
      "Format de rapport",
    );
  });
  const finding = {
    rule_id: "bounds",
    level: "warning",
    location: { path: "src/main.cpp", line: 8 },
    message: "<script>untrusted text</script>",
  };
  it("reads canonical reports without interpreting tool text", () => {
    expect(
      parseFindings(
        JSON.stringify({ findings: [finding, { message: "invalid" }] }),
        "stack",
      ),
    ).toEqual([
      {
        rule: "bounds",
        level: "warning",
        path: "src/main.cpp",
        line: 8,
        message: finding.message,
        tool: "stack",
      },
    ]);
  });
  it("keeps complete records from a truncated NDJSON report", () => {
    expect(
      parseFindings(`${JSON.stringify(finding)}\n{"unfinished":`),
    ).toHaveLength(1);
  });
  it("reads SARIF file and line for editor navigation", () => {
    const report = {
      runs: [
        {
          results: [
            {
              ruleId: "R1",
              message: { text: "Bad access" },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: "main.c" },
                    region: { startLine: 21 },
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    expect(parseFindings(JSON.stringify(report))[0]).toMatchObject({
      path: "main.c",
      line: 21,
      rule: "R1",
    });
  });
});

describe("finding navigation", () => {
  it("maps local SARIF file URIs and encoded relative paths to the selected workspace", () => {
    expect(
      workspaceRelativePath(
        "file:///C:/work/project/src/a%20b.c",
        "\\\\?\\C:\\work\\project",
      ),
    ).toBe("src/a b.c");
    expect(workspaceRelativePath("./src/a%20b.c", "/work/project")).toBe(
      "src/a b.c",
    );
  });
  it("rejects outside roots and traversal", () => {
    for (const path of [
      "file:///C:/other/a.c",
      "../secret",
      "%2e%2e/secret",
      "https://host/file",
    ]) {
      expect(() => workspaceRelativePath(path, "C:/work/project")).toThrow();
    }
  });
});

it("says which machine ran the tool", () => {
  // A cloud finding and a local one are otherwise identical, and the reader
  // cannot tell whether their own machine or the platform produced it.
  const sarif = JSON.stringify({
    findings: [
      { rule_id: "r1", level: "warning", message: "m", location: { path: "a.c", line: 3 } },
    ],
  });
  expect(parseFindings(sarif, "ctrace", "cloud")[0].origin).toBe("cloud");
  expect(parseFindings(sarif, "ctrace", "local")[0].origin).toBe("local");
});

it("takes a job's cost from the job, not from runs the listing never sends", () => {
  // jobs.List returns an empty runs array by design, so summing runs reported
  // zero for every past analysis however much it had actually billed.
  expect(billed({ runs: [], billed_ctu: 9026 } as unknown as Job)).toBe(9026);
  // An older platform sends no total; the runs still answer.
  expect(
    billed({ runs: [{ billed_ctu: 40 }, { billed_ctu: 2 }] } as unknown as Job),
  ).toBe(42);
});
