import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { desktop } from "../bridge";
import { ReportDialog } from "./ReportDialog";

vi.mock("../bridge", () => ({
  native: true,
  desktop: {
    supportCandidates: vi.fn(() =>
      Promise.resolve([
        { name: "CMakeLists.txt", bytes: 120 },
        { name: "Makefile", bytes: 80 },
      ]),
    ),
    supportReadFile: vi.fn((_: string, name: string) =>
      Promise.resolve(`content of ${name}`),
    ),
    supportSend: vi.fn(() => Promise.resolve("report-1")),
    supportMarkReported: vi.fn(() => Promise.resolve()),
  },
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
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
const local = {
  runId: "run-1",
  exitCode: 0,
  cancelled: false,
  report: null,
  stdout:
    "|1| == CoreTrace == [WARN] (flawfinder) Failed, so this file is unanalysed by it.\nError: python: can't open file\n",
  stderr: "",
  warnings: ["Un ou plusieurs outils n’ont pas pu terminer l’analyse."],
};

it("lists the build files ticked, states the privacy promise, and sends", async () => {
  const onSent = vi.fn();
  render(
    <ReportDialog
      workspaceId="w1"
      local={local}
      onClose={vi.fn()}
      onSent={onSent}
    />,
  );
  const cmake = (await screen.findByLabelText(/CMakeLists\.txt/)) as HTMLInputElement;
  expect(cmake.checked).toBe(true);
  expect(screen.getByText(/Ces données restent privées/)).toBeDefined();
  await userEvent.type(screen.getByLabelText(/Quelles librairies/), "SDL2");
  await userEvent.click(screen.getByLabelText(/Makefile/)); // untick
  await userEvent.click(screen.getByRole("button", { name: /Envoyer/ }));
  await waitFor(() => expect(onSent).toHaveBeenCalledWith("report-1"));
  const sent = vi.mocked(desktop.supportSend).mock.calls[0][0];
  expect(sent.tools).toEqual(["flawfinder"]);
  expect(sent.libraries).toBe("SDL2");
  expect(sent.files.map((f) => f.name)).toEqual(["CMakeLists.txt"]);
  expect(sent.log).toContain("can't open file");
  expect(desktop.supportMarkReported).toHaveBeenCalledWith("w1", "run-1");
});

it("shows the platform's refusal in place", async () => {
  vi.mocked(desktop.supportSend).mockRejectedValueOnce(
    new Error("Vous avez atteint la limite de rapports. Réessayez dans 3 heures."),
  );
  render(
    <ReportDialog
      workspaceId="w1"
      local={local}
      onClose={vi.fn()}
      onSent={vi.fn()}
    />,
  );
  await screen.findByLabelText(/CMakeLists\.txt/);
  await userEvent.click(screen.getByRole("button", { name: /Envoyer/ }));
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("3 heures");
});
