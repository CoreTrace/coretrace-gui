import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceEditor } from "./WorkspaceEditor";
import { ConfirmProvider } from "../components/Dialog";
import { desktop } from "../bridge";
import type { Document } from "../types";

vi.mock("../bridge", () => ({
  desktop: { files: vi.fn(), read: vi.fn(), save: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));
vi.mock("@monaco-editor/react", () => ({
  loader: { config: vi.fn() },
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="Editor buffer"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
vi.mock("monaco-editor/esm/vs/editor/editor.api", () => ({}));
vi.mock("monaco-editor/esm/vs/basic-languages/monaco.contribution", () => ({}));
vi.mock("monaco-editor/esm/vs/editor/editor.worker?worker", () => ({
  default: class {},
}));
afterEach(cleanup);
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(desktop.files).mockResolvedValue([
    { name: "main.ts", path: "main.ts", directory: false },
  ]);
  vi.mocked(desktop.read).mockResolvedValue({
    content: "original",
    revision: "revision-1",
  });
});
async function openEditor() {
  const notify = vi.fn();
  const dirty = vi.fn();
  render(
    <ConfirmProvider>
      <WorkspaceEditor
        workspace={{ id: "workspace-1", name: "project", path: "C:/project" }}
        dirtyChanged={dirty}
        run={vi.fn()}
        busy={false}
        notify={notify}
      />
    </ConfirmProvider>,
  );
  await userEvent.click(await screen.findByRole("button", { name: "main.ts" }));
  await screen.findByRole("textbox", { name: "Editor buffer" });
  return { notify, dirty };
}
it("keeps edits made while an earlier save is in flight", async () => {
  let finish!: (document: Document) => void;
  vi.mocked(desktop.save).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await openEditor();
  const buffer = screen.getByRole("textbox", { name: "Editor buffer" });
  fireEvent.change(buffer, { target: { value: "saved snapshot" } });
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  fireEvent.change(buffer, { target: { value: "newer unsaved edit" } });
  await act(async () =>
    finish({ content: "saved snapshot", revision: "revision-2" }),
  );
  expect((buffer as HTMLTextAreaElement).value).toBe("newer unsaved edit");
  expect(
    screen
      .getByRole("button", { name: "Enregistrer" })
      .hasAttribute("disabled"),
  ).toBe(false);
  expect(desktop.save).toHaveBeenCalledWith(
    "workspace-1",
    "main.ts",
    "saved snapshot",
    "revision-1",
  );
});
it("keeps a conflicted draft and respects cancelling a dirty-tab close", async () => {
  vi.mocked(desktop.save).mockRejectedValue(new Error("File changed on disk"));
  const { notify } = await openEditor();
  const buffer = screen.getByRole("textbox", { name: "Editor buffer" });
  fireEvent.change(buffer, { target: { value: "my draft" } });
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith("Error: File changed on disk"),
  );
  expect((buffer as HTMLTextAreaElement).value).toBe("my draft");
  await userEvent.click(screen.getByRole("button", { name: "Fermer main.ts" }));
  await userEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Annuler" }),
  );
  expect(screen.getByRole("tab", { name: /main.ts/ })).toBeTruthy();
  expect((buffer as HTMLTextAreaElement).value).toBe("my draft");
});

it("reopens the files a folder had open, from disk", async () => {
  // Switching folders remounts the editor, so tabs were lost. What comes back
  // is which files were open, never their unsaved drafts: switching discards
  // those by design, and resurrecting them would contradict the warning.
  const tabsChanged = vi.fn();
  render(
    <ConfirmProvider>
      <WorkspaceEditor
        workspace={{ id: "workspace-1", name: "project", path: "C:/project" }}
        dirtyChanged={vi.fn()}
        run={vi.fn()}
        busy={false}
        notify={vi.fn()}
        restore={{ paths: ["main.ts"], active: "main.ts" }}
        tabsChanged={tabsChanged}
      />
    </ConfirmProvider>,
  );

  // The file is opened again without the reader clicking the tree.
  const buffer = (await screen.findByRole("textbox", {
    name: "Editor buffer",
  })) as HTMLTextAreaElement;
  expect(buffer.value).toBe("original");
  expect(desktop.read).toHaveBeenCalledWith("workspace-1", "main.ts");
  await waitFor(() =>
    expect(tabsChanged).toHaveBeenCalledWith(["main.ts"], "main.ts"),
  );
});

it("reports an emptied folder so nothing stale is restored", async () => {
  const tabsChanged = vi.fn();
  render(
    <ConfirmProvider>
      <WorkspaceEditor
        workspace={{ id: "workspace-1", name: "project", path: "C:/project" }}
        dirtyChanged={vi.fn()}
        run={vi.fn()}
        busy={false}
        notify={vi.fn()}
        tabsChanged={tabsChanged}
      />
    </ConfirmProvider>,
  );
  await waitFor(() => expect(tabsChanged).toHaveBeenCalledWith([], ""));
});
