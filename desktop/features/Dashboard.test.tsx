import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { Dashboard } from "./Dashboard";
import type { CloudModel } from "../useCloud";
import type { Job, Workspace } from "../types";

afterEach(cleanup);

const workspace: Workspace = { id: "w1", name: "engine", path: "/work/engine" };

function cloud(overrides: Partial<CloudModel> = {}): CloudModel {
  return {
    me: null,
    org: "",
    jobs: [],
    limits: null,
    ...overrides,
  } as unknown as CloudModel;
}

function handlers() {
  return {
    navigate: vi.fn(),
    openFolder: vi.fn(),
    clone: vi.fn(),
    analyse: vi.fn(),
    login: vi.fn(),
    selectJob: vi.fn(),
  };
}

it("invites a signed-out reader to connect, rather than showing a quota it cannot know", () => {
  const fns = handlers();
  render(<Dashboard cloud={cloud()} workspace={null} {...fns} />);
  expect(screen.getByText("Retrouvez votre espace CoreTrace")).toBeDefined();
  expect(screen.queryByText("CTU disponibles")).toBeNull();
});

it("asks to connect, and nothing else, when signed out", async () => {
  const fns = handlers();
  render(<Dashboard cloud={cloud()} workspace={null} {...fns} />);
  await userEvent.click(screen.getByRole("button", { name: /Se connecter/ }));
  expect(fns.login).toHaveBeenCalledTimes(1);
});

it("reads the organisation's usage off the limits the platform sent", () => {
  const fns = handlers();
  render(
    <Dashboard
      cloud={cloud({
        me: { principal: { kind: "user", name: "Ada" }, orgs: [] } as never,
        org: "alpha",
        limits: {
          plan: "Team",
          remaining_budget_ctu: 4000,
          period_allowance_ctu: 10000,
          period_used_ctu: 6000,
          period_ends_at: "2026-10-01T00:00:00Z",
        } as never,
      })}
      workspace={null}
      {...fns}
    />,
  );
  expect(screen.getByText("Bonjour, Ada.", { exact: false })).toBeDefined();
  expect(screen.getByText("4 000")).toBeDefined(); // remaining CTU
  expect(screen.getByText("sur 10 000 CTU pour cette période")).toBeDefined();
  expect(screen.getByText("Team")).toBeDefined();
});

it("shows placeholders rather than a stale or invented figure while limits have not loaded", () => {
  const fns = handlers();
  render(
    <Dashboard
      cloud={cloud({
        me: { principal: { kind: "user", name: "Ada" }, orgs: [] } as never,
        org: "alpha",
        limits: null,
      })}
      workspace={null}
      {...fns}
    />,
  );
  // Every figure falls back to a dash: getNodeText only reads a node's own
  // text children, so "— CTU" (with the nested <small>) collapses to "—" too.
  expect(screen.getAllByText("—", { selector: "strong" })).toHaveLength(3);
  expect(
    screen.getByText("Allocation de période non communiquée"),
  ).toBeDefined();
  expect(
    screen.getByText("Connexion à la plateforme nécessaire"),
  ).toBeDefined();
});

it("warns only once the remaining budget drops under a tenth of the allowance", () => {
  const fns = handlers();
  const notice = "Votre quota est presque épuisé";
  const { rerender } = render(
    <Dashboard
      cloud={cloud({
        me: { principal: { kind: "user" }, orgs: [] } as never,
        org: "alpha",
        limits: {
          plan: "Team",
          remaining_budget_ctu: 2000,
          period_allowance_ctu: 10000,
          period_used_ctu: 8000,
          period_ends_at: "2026-10-01T00:00:00Z",
        } as never,
      })}
      workspace={null}
      {...fns}
    />,
  );
  expect(screen.queryByText(notice, { exact: false })).toBeNull();

  rerender(
    <Dashboard
      cloud={cloud({
        me: { principal: { kind: "user" }, orgs: [] } as never,
        org: "alpha",
        limits: {
          plan: "Team",
          remaining_budget_ctu: 500,
          period_allowance_ctu: 10000,
          period_used_ctu: 9500,
          period_ends_at: "2026-10-01T00:00:00Z",
        } as never,
      })}
      workspace={null}
      {...fns}
    />,
  );
  expect(screen.getByText(notice, { exact: false })).toBeDefined();
});

it("offers to open, clone or analyse when no folder is open, and nothing to resume", () => {
  const fns = handlers();
  render(<Dashboard cloud={cloud()} workspace={null} {...fns} />);
  expect(screen.queryByText(/Reprendre/)).toBeNull();
  expect(screen.getByText("Ouvrir un dossier")).toBeDefined();
  expect(screen.getByText("Cloner un dépôt GitHub")).toBeDefined();
});

it("lets an open folder be resumed or analysed directly, hiding the picker", async () => {
  const fns = handlers();
  render(<Dashboard cloud={cloud()} workspace={workspace} {...fns} />);
  expect(screen.queryByText("Ouvrir un dossier")).toBeNull();

  await userEvent.click(
    screen.getByRole("button", { name: /Analyser engine/ }),
  );
  expect(fns.analyse).toHaveBeenCalledTimes(1);

  await userEvent.click(screen.getByRole("button", { name: /Reprendre/ }));
  expect(fns.navigate).toHaveBeenCalledWith("workspace");
});

it("shows an empty state until an analysis exists", () => {
  const fns = handlers();
  render(<Dashboard cloud={cloud()} workspace={null} {...fns} />);
  expect(screen.getByText("Aucune analyse à afficher.")).toBeDefined();
});

it("names a job by its repository, falling back to its label, then to imported sources", () => {
  const fns = handlers();
  const jobs = [
    {
      id: "1",
      status: "completed",
      conclusion: "findings",
      created_at: "2026-09-01T10:00:00Z",
      source: { kind: "scm", repo_full_name: "CoreTrace/gui" },
      runs: [],
    },
    {
      id: "2",
      status: "completed",
      conclusion: "clean",
      created_at: "2026-09-01T10:00:00Z",
      label: "uploaded.zip",
      runs: [],
    },
    {
      id: "3",
      status: "completed",
      conclusion: "clean",
      created_at: "2026-09-01T10:00:00Z",
      runs: [],
    },
    {
      // Carries both a repository and a label: the repository must win, since
      // it is the more specific of the two.
      id: "4",
      status: "completed",
      conclusion: "clean",
      created_at: "2026-09-01T10:00:00Z",
      source: { kind: "scm", repo_full_name: "Both/repo" },
      label: "should-be-ignored",
      runs: [],
    },
  ] as unknown as Job[];
  render(<Dashboard cloud={cloud({ jobs })} workspace={null} {...fns} />);
  expect(screen.getByText("CoreTrace/gui")).toBeDefined();
  expect(screen.getByText("uploaded.zip")).toBeDefined();
  expect(screen.getByText("Sources importées")).toBeDefined();
  expect(screen.getByText("Both/repo")).toBeDefined();
  expect(screen.queryByText("should-be-ignored")).toBeNull();
});

it("hands the selected job back, and only that one, when a row is clicked", async () => {
  const fns = handlers();
  const jobs = [
    {
      id: "1",
      status: "completed",
      conclusion: "clean",
      created_at: "2026-09-01T10:00:00Z",
      label: "first",
      runs: [],
    },
    {
      id: "2",
      status: "completed",
      conclusion: "clean",
      created_at: "2026-09-02T10:00:00Z",
      label: "second",
      runs: [],
    },
  ] as unknown as Job[];
  render(<Dashboard cloud={cloud({ jobs })} workspace={null} {...fns} />);
  await userEvent.click(screen.getByText("second"));
  expect(fns.selectJob).toHaveBeenCalledWith(jobs[1]);
  expect(fns.selectJob).toHaveBeenCalledTimes(1);
});

it("only ever shows the ten most recent jobs", () => {
  const fns = handlers();
  const jobs = Array.from({ length: 12 }, (_, i) => ({
    id: String(i),
    status: "completed",
    conclusion: "clean",
    created_at: "2026-09-01T10:00:00Z",
    label: `job-${i}`,
    runs: [],
  })) as unknown as Job[];
  render(<Dashboard cloud={cloud({ jobs })} workspace={null} {...fns} />);
  expect(screen.getAllByRole("button", { name: /job-/ })).toHaveLength(10);
});
