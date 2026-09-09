import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { Analyses, Findings } from "./Analyses";
import { ConfirmProvider } from "../components/Dialog";
import { desktop } from "../bridge";
import type { CloudModel } from "../useCloud";
import type { LocalResult } from "../types";
vi.mock("../bridge", () => ({
  desktop: {
    analyseCloud: vi.fn(),
    readCloud: vi.fn(),
  },
  errorMessage: (e: unknown) => String(e),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
const repo = {
  id: "repo",
  installation: "installation",
  full_name: "CoreTrace/project",
  default_branch: "main",
  enabled: true,
  external_repo_id: "1",
  summary_comments: false,
};
const cloud = {
  org: "alpha",
  me: { principal: { kind: "user" } },
  repositories: [repo],
  jobs: [],
  refresh: vi.fn(),
} as unknown as CloudModel;
function form(local: LocalResult | null = null) {
  const select = vi.fn();
  const notify = vi.fn();
  render(
    <ConfirmProvider>
      <Analyses
        cloud={cloud}
        selected={null}
        select={select}
        initialRepository={repo}
        initialRef=""
        clearDraft={vi.fn()}
        notify={notify}
        openFinding={vi.fn()}
        local={local}
        localRunning={false}
        openWorkspace={vi.fn()}
      />
    </ConfirmProvider>,
  );
  return { select, notify };
}
it("shows incomplete execution even when ctrace exits successfully", () => {
  form({
    exitCode: 0,
    stdout: "Failed to create process",
    stderr: "",
    report: null,
    cancelled: false,
    warnings: ["Outil indisponible"],
  });
  expect(screen.getByText("Analyse incomplète")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("Outil indisponible");
  expect(
    screen.getByText("Sortie de ctrace").parentElement?.hasAttribute("open"),
  ).toBe(true);
});
it("does not submit a paid cloud run when confirmation is dismissed", async () => {
  form();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Lancer l’analyse" }));
  const dialog = screen.getByRole("dialog");
  expect(dialog.textContent).toContain("CoreTrace/project · main");
  await user.click(within(dialog).getByRole("button", { name: "Annuler" }));
  expect(desktop.analyseCloud).not.toHaveBeenCalled();
});
it("reuses the idempotency key on retry after an uncertain network failure", async () => {
  vi.mocked(desktop.analyseCloud).mockRejectedValue(
    new Error("Network interrupted"),
  );
  const { notify } = form();
  const user = userEvent.setup();
  for (let count = 1; count <= 2; count++) {
    await user.click(screen.getByRole("button", { name: "Lancer l’analyse" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Lancer l’analyse",
      }),
    );
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(count));
  }
  const calls = vi.mocked(desktop.analyseCloud).mock.calls;
  expect(calls[0].slice(0, 5)).toEqual([
    "alpha",
    "installation",
    "repo",
    "main",
    false,
  ]);
  expect(calls[0][5]).toBe(calls[1][5]);
});
it("renders report messages as text and sends a location to the editor", async () => {
  const open = vi.fn();
  render(
    <Findings
      findings={[
        {
          rule: "bounds",
          level: "error",
          path: "src/main.c",
          line: 14,
          message: "<img src=x onerror=alert(1)>",
        },
      ]}
      open={open}
    />,
  );
  expect(document.querySelector("img")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "src/main.c:14" }));
  expect(open).toHaveBeenCalledWith("src/main.c", 14);
});

it("opens the analysis that already covers the commit", async () => {
  // The platform answers 409 naming the job that already exists. Reporting only
  // "Conflict (HTTP 409)" threw that away and left the reader with nowhere to go.
  const existing = { id: "job-9", status: "succeeded", created_at: "2026-01-01T00:00:00Z", runs: [] };
  vi.mocked(desktop.analyseCloud).mockResolvedValue({ existing_job: "job-9" } as never);
  vi.mocked(desktop.readCloud).mockResolvedValue(existing as never);
  const { select, notify } = form();

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Lancer l’analyse" }));
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Lancer l’analyse",
    }),
  );

  await waitFor(() => expect(select).toHaveBeenCalledWith(existing));
  expect(notify).toHaveBeenCalledWith(expect.stringContaining("déjà été analysé"));
});

it("counts what the search actually shows", async () => {
  // The heading counted every finding while the list showed the filtered ones,
  // so searching left a number that described nothing on screen.
  render(
    <Findings
      open={vi.fn()}
      findings={[
        { rule: "r1", level: "error", path: "a.c", line: 1, message: "buffer overflow" },
        { rule: "r2", level: "warning", path: "b.c", line: 2, message: "unused variable" },
        { rule: "r3", level: "note", path: "c.c", line: 3, message: "style" },
      ]}
    />,
  );
  expect(screen.getByRole("heading", { name: /Résultats 3/ })).toBeDefined();
  await userEvent.type(screen.getByLabelText("Filtrer les résultats"), "overflow");
  expect(screen.getByRole("heading", { name: /1 sur 3/ })).toBeDefined();
});

it("marks a level with its letter, not its name", () => {
  render(
    <Findings
      open={vi.fn()}
      findings={[{ rule: "r", level: "error", path: "a.c", line: 1, message: "m" }]}
    />,
  );
  const mark = screen.getByLabelText("Erreur");
  expect(mark.textContent).toBe("E");
});
