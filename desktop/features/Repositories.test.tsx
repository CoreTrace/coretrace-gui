import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { Repositories } from "./Repositories";
import { desktop } from "../bridge";
import type { CloudModel } from "../useCloud";
import type { Repository } from "../types";

vi.mock("../bridge", () => ({
  native: true,
  desktop: {
    clonedRepositories: vi.fn(() => Promise.resolve([])),
    openAccount: vi.fn(() => Promise.resolve()),
  },
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function repo(overrides: Partial<Repository> = {}): Repository {
  return {
    id: overrides.full_name ?? "repo",
    installation: "installation",
    full_name: "CoreTrace/gui",
    default_branch: "main",
    enabled: true,
    external_repo_id: "1",
    summary_comments: false,
    ...overrides,
  } as Repository;
}

function cloud(overrides: Partial<CloudModel> = {}): CloudModel {
  return {
    org: "alpha",
    me: { principal: { kind: "user" }, orgs: [] },
    repositories: [],
    ...overrides,
  } as unknown as CloudModel;
}

function handlers() {
  return { clone: vi.fn(), analyse: vi.fn(), notify: vi.fn() };
}

it("says there is nothing to see yet, and why, when signed in with no repositories", () => {
  const fns = handlers();
  render(<Repositories cloud={cloud()} {...fns} />);
  expect(screen.getByText("Aucun dépôt GitHub connecté")).toBeDefined();
});

it("points a signed-out reader at connecting instead", () => {
  const fns = handlers();
  render(<Repositories cloud={cloud({ me: null })} {...fns} />);
  expect(screen.getByText("Connectez votre compte CoreTrace")).toBeDefined();
});

it("searches every repository, not only the ones on screen", async () => {
  const fns = handlers();
  const repos = [
    repo({ id: "a", full_name: "CoreTrace/gui" }),
    repo({ id: "b", full_name: "CoreTrace/backend" }),
    repo({ id: "c", full_name: "Other/tool" }),
  ];
  render(<Repositories cloud={cloud({ repositories: repos })} {...fns} />);
  await userEvent.type(
    screen.getByLabelText("Rechercher un dépôt"),
    "coretrace",
  );
  expect(screen.getByText("CoreTrace/gui")).toBeDefined();
  expect(screen.getByText("CoreTrace/backend")).toBeDefined();
  expect(screen.queryByText("Other/tool")).toBeNull();
  expect(screen.getByText("2 sur 3")).toBeDefined();
});

it("shows no cards, and neither empty state, when a search matches nothing", async () => {
  // cloud.repositories is not empty, so this is not "no repositories" —
  // it is "none of them match", and the grid should say so with a count
  // rather than either a card or the connect-your-account empty state.
  const fns = handlers();
  const repos = [repo({ id: "a", full_name: "CoreTrace/gui" })];
  render(<Repositories cloud={cloud({ repositories: repos })} {...fns} />);
  await userEvent.type(
    screen.getByLabelText("Rechercher un dépôt"),
    "does-not-exist",
  );
  expect(screen.queryByText("CoreTrace/gui")).toBeNull();
  expect(screen.queryByRole("article")).toBeNull();
  expect(screen.getByText("0 sur 1")).toBeDefined();
  expect(screen.queryByText("Aucun dépôt GitHub connecté")).toBeNull();
});

it("lets a signed-in reader manage connections from the header, without going through a card", async () => {
  const fns = handlers();
  const repos = [repo({ id: "a", full_name: "CoreTrace/gui" })];
  render(<Repositories cloud={cloud({ repositories: repos })} {...fns} />);
  await userEvent.click(
    screen.getByRole("button", { name: /Gérer les connexions/ }),
  );
  expect(desktop.openAccount).toHaveBeenCalledWith("repositories");
});

it("shows a first page of cards and reveals the rest on request", async () => {
  const fns = handlers();
  const repos = Array.from({ length: 8 }, (_, i) =>
    repo({ id: String(i), full_name: `org/repo-${i}` }),
  );
  render(<Repositories cloud={cloud({ repositories: repos })} {...fns} />);
  expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(6);
  const more = screen.getByRole("button", { name: /Afficher plus/ });
  expect(more.textContent).toContain("2 restants");

  await userEvent.click(more);
  expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(8);
  expect(screen.queryByRole("button", { name: /Afficher plus/ })).toBeNull();
});

it("offers to clone what is not yet on this machine, and to open what already is", async () => {
  const fns = handlers();
  vi.mocked(desktop.clonedRepositories).mockResolvedValue(["CoreTrace/gui"]);
  const repos = [
    repo({ id: "a", full_name: "CoreTrace/gui" }),
    repo({ id: "b", full_name: "CoreTrace/backend" }),
  ];
  render(<Repositories cloud={cloud({ repositories: repos })} {...fns} />);

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Ouvrir" })).toBeDefined(),
  );
  expect(
    screen.getByRole("button", { name: "Cloner et ouvrir" }),
  ).toBeDefined();

  await userEvent.click(screen.getByRole("button", { name: "Ouvrir" }));
  expect(fns.clone).toHaveBeenCalledWith("CoreTrace/gui");

  await userEvent.click(
    screen.getByRole("button", { name: "Cloner et ouvrir" }),
  );
  expect(fns.clone).toHaveBeenCalledWith("CoreTrace/backend");
});

it("sends an enabled repository straight to analysis", async () => {
  const fns = handlers();
  const enabled = repo({ id: "a", full_name: "CoreTrace/gui", enabled: true });
  render(<Repositories cloud={cloud({ repositories: [enabled] })} {...fns} />);
  await userEvent.click(screen.getByRole("button", { name: "Analyser" }));
  expect(fns.analyse).toHaveBeenCalledWith(enabled);
});

it("sends a disabled repository to the web instead of promising an analysis it cannot run", async () => {
  const fns = handlers();
  const disabled = repo({
    id: "a",
    full_name: "CoreTrace/gui",
    enabled: false,
  });
  render(<Repositories cloud={cloud({ repositories: [disabled] })} {...fns} />);
  expect(screen.queryByRole("button", { name: "Analyser" })).toBeNull();
  await userEvent.click(
    screen.getByRole("button", { name: /Activer sur le web/ }),
  );
  expect(fns.analyse).not.toHaveBeenCalled();
  expect(desktop.openAccount).toHaveBeenCalledWith("repositories");
});

it("opens the clone dialog with nothing preselected from the header button", async () => {
  const fns = handlers();
  render(<Repositories cloud={cloud()} {...fns} />);
  await userEvent.click(
    screen.getByRole("button", { name: /Cloner un dépôt/ }),
  );
  expect(fns.clone).toHaveBeenCalledWith();
});
