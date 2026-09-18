import { expect, it, vi } from "vitest";
import { launchAnalysis } from "./launch";

const deps = (org: string, accepted: boolean) => ({
  workspace: "C:/work",
  org,
  startCloud: vi.fn().mockResolvedValue(accepted),
  runLocal: vi.fn().mockResolvedValue(undefined),
  notify: vi.fn(),
});

it("spends CTU when the platform takes the run", async () => {
  const d = deps("alpha", true);
  expect(await launchAnalysis(d)).toBe("cloud");
  expect(d.startCloud).toHaveBeenCalledWith("C:/work", "alpha");
  expect(d.runLocal).not.toHaveBeenCalled();
});

it("analyses on this machine when the platform refuses, and says so", async () => {
  // The cloud call reports its own error; this only announces the fallback.
  const d = deps("alpha", false);
  expect(await launchAnalysis(d)).toBe("local");
  expect(d.runLocal).toHaveBeenCalled();
  expect(d.notify).toHaveBeenCalledWith(
    expect.stringContaining("sur cette machine"),
  );
});

it("goes straight to this machine when there is no organisation to bill", async () => {
  const d = deps("", true);
  expect(await launchAnalysis(d)).toBe("local");
  expect(d.startCloud).not.toHaveBeenCalled();
  expect(d.notify).not.toHaveBeenCalled();
});
