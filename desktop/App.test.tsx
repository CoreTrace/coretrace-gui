import { forwardRef, useImperativeHandle } from "react";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, expect, it, test, vi } from "vitest";
import App from "./App";
import { ConfirmProvider } from "./components/Dialog";
import { desktop } from "./bridge";
import type { Workspace } from "./types";

const workspaceA: Workspace = { id: "w1", name: "alpha", path: "/work/alpha" };
const workspaceB: Workspace = { id: "w2", name: "beta", path: "/work/beta" };

type CloseHandler = (event: {
  preventDefault: () => void;
}) => void | Promise<void>;
let closeHandler: CloseHandler | undefined;
const destroy = vi.fn(() => Promise.resolve());

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: (handler: CloseHandler) => {
      closeHandler = handler;
      return Promise.resolve(() => {});
    },
    destroy,
  }),
}));
// A stand-in for the real, Monaco-backed editor: only what these tests drive
// — dirtying the buffer, and asking to run a file — matters here.
vi.mock("./features/WorkspaceEditor", () => ({
  WorkspaceEditor: forwardRef(function FakeEditor(
    props: {
      dirtyChanged: (dirty: boolean) => void;
      run: (path: string) => void;
    },
    ref: React.Ref<{ open: () => Promise<void> }>,
  ) {
    useImperativeHandle(ref, () => ({ open: vi.fn() }));
    return (
      <>
        <button onClick={() => props.dirtyChanged(true)}>
          Modifier le fichier
        </button>
        <button onClick={() => props.run("main.c")}>
          Lancer l’analyse sur ce fichier
        </button>
      </>
    );
  }),
}));
vi.mock("./features/Dashboard", () => ({
  Dashboard: (props: { openFolder: () => void }) => (
    <button onClick={props.openFolder}>Ouvrir depuis le tableau de bord</button>
  ),
}));
vi.mock("./features/Repositories", () => ({ Repositories: () => null }));
vi.mock("./features/Analyses", () => ({ Analyses: () => null }));
vi.mock("./features/Settings", () => ({ Settings: () => null }));
vi.mock("./bridge", () => ({
  native: true,
  desktop: {
    status: vi.fn(),
    restoreSession: vi.fn(),
    cloudRunStatus: vi.fn(),
    chooseWorkspace: vi.fn(),
    closeWorkspace: vi.fn(),
    cancelLocal: vi.fn(),
    localHistory: vi.fn(),
  },
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

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
  vi.mocked(desktop.status).mockResolvedValue({
    signedIn: false,
    baseUrl: "https://api.coretrace.fr/v1",
  });
  // A session that cannot be restored is a first run, not a failure.
  vi.mocked(desktop.restoreSession).mockRejectedValue(new Error("no session"));
  vi.mocked(desktop.cloudRunStatus).mockResolvedValue({ phase: "idle" });
  vi.mocked(desktop.localHistory).mockResolvedValue([]);
  vi.mocked(desktop.closeWorkspace).mockResolvedValue([]);
  vi.mocked(desktop.cancelLocal).mockResolvedValue();
  closeHandler = undefined;
});
afterEach(cleanup);

async function openWorkspaceA(user: ReturnType<typeof userEvent.setup>) {
  vi.mocked(desktop.chooseWorkspace).mockResolvedValueOnce(workspaceA);
  await user.click(await screen.findByText("Ouvrir depuis le tableau de bord"));
  await screen.findByText("Modifier le fichier");
}

it("declines to switch folders until unsaved changes are confirmed away", async () => {
  const user = userEvent.setup();
  render(
    <ConfirmProvider>
      <App />
    </ConfirmProvider>,
  );
  await openWorkspaceA(user);
  await user.click(screen.getByText("Modifier le fichier"));

  await user.click(
    screen.getByTitle("Ouvrir un autre dossier dans cet espace de travail"),
  );
  const dialog = await screen.findByRole("dialog", {
    name: "Changer de dossier ?",
  });
  await user.click(within(dialog).getByText("Annuler"));

  expect(screen.queryByRole("dialog")).toBeNull();
  // Only the first, original open — the declined switch never asked again.
  expect(desktop.chooseWorkspace).toHaveBeenCalledTimes(1);
});

it("switches folders once discarding unsaved changes is confirmed", async () => {
  const user = userEvent.setup();
  render(
    <ConfirmProvider>
      <App />
    </ConfirmProvider>,
  );
  await openWorkspaceA(user);
  await user.click(screen.getByText("Modifier le fichier"));

  vi.mocked(desktop.chooseWorkspace).mockResolvedValueOnce(workspaceB);
  await user.click(
    screen.getByTitle("Ouvrir un autre dossier dans cet espace de travail"),
  );
  const dialog = await screen.findByRole("dialog", {
    name: "Changer de dossier ?",
  });
  await user.click(within(dialog).getByText("Changer de dossier"));

  await waitFor(() =>
    expect(
      (
        screen.getByRole("combobox", {
          name: "Dossier actif",
        }) as HTMLSelectElement
      ).value,
    ).toBe("w2"),
  );
  expect(desktop.chooseWorkspace).toHaveBeenCalledTimes(2);
});

it("blocks a native close request while work would be lost, and closes once confirmed", async () => {
  const user = userEvent.setup();
  render(
    <ConfirmProvider>
      <App />
    </ConfirmProvider>,
  );
  await openWorkspaceA(user);
  await user.click(screen.getByText("Modifier le fichier"));
  await waitFor(() => expect(closeHandler).toBeDefined());

  const event = { preventDefault: vi.fn() };
  void closeHandler!(event);
  expect(event.preventDefault).toHaveBeenCalled();
  const dialog = await screen.findByRole("dialog", {
    name: "Fermer CoreTrace ?",
  });
  await user.click(within(dialog).getByText("Quitter"));

  await waitFor(() => expect(destroy).toHaveBeenCalled());
});

it("lets a native close request through when nothing would be lost", async () => {
  render(
    <ConfirmProvider>
      <App />
    </ConfirmProvider>,
  );
  await waitFor(() => expect(closeHandler).toBeDefined());

  const event = { preventDefault: vi.fn() };
  await closeHandler!(event);

  expect(event.preventDefault).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(destroy).not.toHaveBeenCalled();
});

it("offers to open a different folder instead of analysing, from the sidebar's confirm dialog", async () => {
  // "Nouvelle analyse" from the sidebar names no folder on screen, so it asks
  // first — and, since the reader may not have meant the open folder, offers
  // opening a different one as the other thing "new" can mean.
  const user = userEvent.setup();
  render(
    <ConfirmProvider>
      <App />
    </ConfirmProvider>,
  );
  await openWorkspaceA(user);

  await user.click(screen.getByRole("button", { name: /Nouvelle analyse/ }));
  const dialog = await screen.findByRole("dialog", {
    name: "Analyser alpha ?",
  });

  vi.mocked(desktop.chooseWorkspace).mockResolvedValueOnce(workspaceB);
  await user.click(within(dialog).getByText("Ouvrir un autre dossier"));

  await waitFor(() =>
    expect(
      (
        screen.getByRole("combobox", {
          name: "Dossier actif",
        }) as HTMLSelectElement
      ).value,
    ).toBe("w2"),
  );
});

it("blocks a folder switch while an operation is already running, without asking to discard anything", async () => {
  // Starting a second operation mid-flight would race the first; the busy
  // guard has to be checked before the dirty one, or it would ask to discard
  // work instead of simply saying to wait.
  const user = userEvent.setup();
  render(
    <ConfirmProvider>
      <App />
    </ConfirmProvider>,
  );
  await openWorkspaceA(user);

  vi.mocked(desktop.chooseWorkspace).mockReturnValueOnce(new Promise(() => {}));
  await user.click(
    screen.getByTitle("Ouvrir un autre dossier dans cet espace de travail"),
  );
  await user.click(
    screen.getByTitle("Ouvrir un autre dossier dans cet espace de travail"),
  );

  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    await screen.findByText(
      "Attendez la fin de l’opération en cours avant de changer de dossier.",
    ),
  ).toBeDefined();
  // openWorkspaceA already made one call; the pending one here is the only
  // other — the second click never reached the bridge at all.
  expect(desktop.chooseWorkspace).toHaveBeenCalledTimes(2);
});

it("sends a local run to Settings, with a reason, when no ctrace executable is chosen", async () => {
  const user = userEvent.setup();
  render(
    <ConfirmProvider>
      <App />
    </ConfirmProvider>,
  );
  await openWorkspaceA(user);

  await user.click(screen.getByText("Lancer l’analyse sur ce fichier"));

  expect(
    await screen.findByText(
      "Sélectionnez le programme ctrace avant de lancer une analyse locale.",
    ),
  ).toBeDefined();
  expect(screen.getByText("Paramètres").closest("button")?.className).toBe(
    "active",
  );
});
