import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { desktop } from "./bridge";
import { useCloud } from "./useCloud";
import type { Job } from "./types";
vi.mock("./bridge", () => ({
  desktop: { status: vi.fn(), readCloud: vi.fn(), logout: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(desktop.status).mockResolvedValue({
    signedIn: true,
    baseUrl: "https://test.invalid/v1",
  });
});
function identity() {
  return {
    principal: { kind: "user" },
    orgs: [
      { id: "a", slug: "alpha" },
      { id: "b", slug: "beta" },
    ],
  };
}
it("discards responses for an organisation after switching to another", async () => {
  let resolveAlpha!: (value: Job[]) => void;
  const alphaJobs = new Promise<Job[]>((resolve) => {
    resolveAlpha = resolve;
  });
  vi.mocked(desktop.readCloud).mockImplementation(async (resource, org) => {
    if (resource === "me") return identity();
    if (resource === "limits")
      return { remaining_budget_ctu: org === "alpha" ? 10 : 20 };
    if (resource === "jobs" && org === "alpha") return alphaJobs;
    if (resource === "jobs")
      return [{ id: "beta-job", created_at: "2026-01-01", runs: [] }];
    return [];
  });
  const { result } = renderHook(useCloud);
  await waitFor(() => expect(result.current.org).toBe("alpha"));
  act(() => result.current.setOrg("beta"));
  await waitFor(() => expect(result.current.jobs[0]?.id).toBe("beta-job"));
  await act(async () => resolveAlpha([{ id: "alpha-job" } as Job]));
  expect(result.current.jobs[0]?.id).toBe("beta-job");
  expect(result.current.limits?.remaining_budget_ctu).toBe(20);
});
it("keeps successful sections while reporting a failed resource", async () => {
  vi.mocked(desktop.readCloud).mockImplementation(async (resource) => {
    if (resource === "me") return identity();
    if (resource === "limits") throw new Error("Limits unavailable");
    if (resource === "jobs")
      return [{ id: "job", created_at: "2026-01-01", runs: [] }];
    return [];
  });
  const { result } = renderHook(useCloud);
  await waitFor(() =>
    expect(result.current.error).toContain("Limits unavailable"),
  );
  expect(result.current.jobs[0]?.id).toBe("job");
  expect(result.current.limits).toBeNull();
});
it("clears account data even if remote sign-out fails", async () => {
  vi.mocked(desktop.readCloud).mockImplementation(async (resource) =>
    resource === "me" ? identity() : [],
  );
  vi.mocked(desktop.logout).mockRejectedValue(new Error("Offline"));
  const { result } = renderHook(useCloud);
  await waitFor(() => expect(result.current.me).not.toBeNull());
  await act(async () => {
    await expect(result.current.signOut()).rejects.toThrow("Offline");
  });
  expect(result.current.me).toBeNull();
  expect(result.current.jobs).toEqual([]);
});
