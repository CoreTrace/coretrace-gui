import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { desktop } from "../bridge";
import { CloudRun } from "./CloudRun";
import { useCloudRun } from "../useCloudRun";

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

/** The panel with the run that drives it, as the application assembles them. */
function Harness({
  onFinished,
  workspace = "C:/work/app",
}: {
  onFinished: (job: string) => void;
  workspace?: string;
}) {
  const run = useCloudRun({ notify: vi.fn(), onFinished });
  return <CloudRun run={run} workspace={workspace} org="alpha" />;
}

function show(onFinished = vi.fn()) {
  render(<Harness onFinished={onFinished} />);
  return onFinished;
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

it("opens the results once when the run finishes", async () => {
  // The panel said "results below" and did nothing, so a finished analysis
  // showed an empty page. Opening it is what that sentence promised.
  vi.mocked(desktop.cloudRunStatus).mockResolvedValue({ phase: "done", job: "job-7" });
  const onFinished = show();
  await waitFor(() => expect(onFinished).toHaveBeenCalledWith("job-7"));
  await new Promise((r) => setTimeout(r, 1100));
  expect(onFinished).toHaveBeenCalledTimes(1);
});

it("announces a finished run once however long it keeps reporting itself", async () => {
  // The status stays "done" and is polled every second. Announcing it each time
  // would reopen the analysis under the reader as they worked.
  vi.mocked(desktop.cloudRunStatus).mockResolvedValue({ phase: "done", job: "job-42" });
  const onFinished = vi.fn();
  render(<Harness onFinished={onFinished} />);
  await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
  await new Promise((r) => setTimeout(r, 2200));
  expect(onFinished).toHaveBeenCalledTimes(1);
});
