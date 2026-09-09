import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { desktop } from "../bridge";
import { CloudRun } from "./CloudRun";

vi.mock("../bridge", () => ({
  native: true,
  desktop: {
    cloudRunStatus: vi.fn(),
    startCloudRun: vi.fn(() => Promise.resolve()),
    confirmCloudRun: vi.fn(() => Promise.resolve()),
    cancelCloudRun: vi.fn(() => Promise.resolve()),
  },
  errorMessage: (e: unknown) => String(e),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function show() {
  render(<CloudRun workspace="C:/work/app" org="alpha" notify={vi.fn()} />);
}

it("shows the cost and spends nothing until the user approves", async () => {
  // The platform quotes the run and parks it; approving is what spends CTU.
  vi.mocked(desktop.cloudRunStatus).mockResolvedValue({
    phase: "quoted",
    job: "job-1",
    ctu: 4000,
    deadline: "2030-01-01T00:00:00Z",
  });
  show();
  expect(await screen.findByText(/4\s?000 CTU/)).toBeDefined();
  expect(desktop.confirmCloudRun).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: /Lancer/ }));
  expect(desktop.confirmCloudRun).toHaveBeenCalledWith("alpha");
});

it("can be cancelled while it is packing", async () => {
  vi.mocked(desktop.cloudRunStatus).mockResolvedValue({
    phase: "packing",
    files: 12,
    bytes: 4096,
  });
  show();
  await userEvent.click(await screen.findByRole("button", { name: /Annuler/ }));
  expect(desktop.cancelCloudRun).toHaveBeenCalled();
});

it("says what the platform said when a run fails", async () => {
  vi.mocked(desktop.cloudRunStatus).mockResolvedValue({
    phase: "failed",
    reason: "The archive is too large: 900 bytes, and this plan allows 10.",
  });
  show();
  expect(await screen.findByText(/this plan allows 10/)).toBeDefined();
});

it("says whether a cancelled run had already spent anything", async () => {
  vi.mocked(desktop.cloudRunStatus).mockResolvedValue({ phase: "cancelled", spent: false });
  show();
  expect(await screen.findByText(/Aucun CTU/)).toBeDefined();
});

it("offers the run when nothing is happening", async () => {
  vi.mocked(desktop.cloudRunStatus).mockResolvedValue({ phase: "idle" });
  show();
  await userEvent.click(await screen.findByRole("button", { name: /Analyser dans le cloud/ }));
  expect(desktop.startCloudRun).toHaveBeenCalledWith("C:/work/app", "alpha");
});
