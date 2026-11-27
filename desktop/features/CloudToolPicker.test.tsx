import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { desktop } from "../bridge";
import type { Plan, Tool } from "../types";
import { AnalysisLaunch } from "./AnalysisLaunch";

vi.mock("../bridge", () => ({
  native: true,
  desktop: { allFiles: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.restoreAllMocks();
  localStorage.clear();
});

function tool(
  id: string,
  languages: string[],
  required_entitlement: string,
  entitled: boolean,
): Tool {
  return {
    id,
    version: "1.0.0",
    required_entitlement,
    languages,
    entitled,
    isolation: "container",
  };
}

/** The catalogue as a Community organisation sees it, entitlements and all. */
const COMMUNITY = [
  tool("ctrace", ["c", "cpp"], "ctrace", true),
  tool("python-analyzer", ["python"], "python", true),
  tool("python-analyzer-pro", ["python"], "python_plugins", false),
  tool("stack-analyzer", ["c", "cpp"], "stack", false),
  tool("symprobe", ["c", "cpp"], "symbolic", false),
  tool("typescript-analyzer", ["typescript", "javascript"], "typescript", true),
];

/** Plans cheapest first, as the platform lists them. */
const PLANS = [
  { name: "community", entitlements: ["ctrace", "python", "typescript"] },
  {
    name: "pro",
    entitlements: ["ctrace", "python", "typescript", "python_plugins", "stack"],
  },
  {
    name: "enterprise",
    entitlements: [
      "ctrace",
      "python",
      "typescript",
      "python_plugins",
      "stack",
      "symbolic",
    ],
  },
] as Plan[];

const ALPHA = { id: "w1", name: "alpha", path: "/work/alpha" };

function launch(
  cloudTools: Tool[] = COMMUNITY,
  cloudPlans: Plan[] = PLANS,
  workspace = ALPHA,
) {
  const runAnalysis = vi.fn(() => Promise.resolve());
  render(
    <AnalysisLaunch
      launch={{
        workspace,
      }}
      analyserInfo={null}
      analyserError=""
      localTools={[]}
      installing={false}
      preparing={false}
      dirty={false}
      fileDirty={false}
      org="acme"
      cloudTools={cloudTools}
      cloudPlans={cloudPlans}
      launchError=""
      runAnalysis={runAnalysis}
      refreshAnalyser={() => Promise.resolve()}
      chooseLocalAnalyser={() => Promise.resolve()}
      cancelInstall={vi.fn()}
      close={vi.fn()}
      chooseFolder={vi.fn()}
    />,
  );
  return runAnalysis;
}

const box = (name: string) =>
  screen.getByRole("checkbox", { name: new RegExp(`^${name}(\\s|$)`) });
const send = () => screen.getByRole("button", { name: /Envoyer le dossier/ });

it("preselects the tools for the folder's languages", async () => {
  vi.mocked(desktop.allFiles).mockResolvedValue(["src/main.c", "README.md"]);
  launch();
  await waitFor(() => expect(box("ctrace")).toHaveProperty("checked", true));
  expect(box("python-analyzer")).toHaveProperty("checked", false);
  expect(box("typescript-analyzer")).toHaveProperty("checked", false);
});

it("preselects the TypeScript analyser for a web project", async () => {
  vi.mocked(desktop.allFiles).mockResolvedValue(["src/app.tsx", "server.mjs"]);
  launch();
  await waitFor(() =>
    expect(box("typescript-analyzer")).toHaveProperty("checked", true),
  );
  expect(box("ctrace")).toHaveProperty("checked", false);
});

it("shows what the plan lacks as locked, with the plan that unlocks it", async () => {
  vi.mocked(desktop.allFiles).mockResolvedValue(["app.py"]);
  launch();
  await waitFor(() =>
    expect(box("python-analyzer")).toHaveProperty("checked", true),
  );
  const pro = box("python-analyzer-pro");
  expect(pro).toHaveProperty("disabled", true);
  expect(pro).toHaveProperty("checked", false);
  expect(pro.parentElement?.textContent).toContain("Inclus dans l’offre Pro");
  // The cheapest plan that has it, not every plan that does.
  expect(box("symprobe").parentElement?.textContent).toContain(
    "Inclus dans l’offre Enterprise",
  );
  expect(document.body.textContent).not.toContain("python_plugins");
});

it("says a tool is locked without naming a plan when plans are unknown", async () => {
  vi.mocked(desktop.allFiles).mockResolvedValue(["app.py"]);
  launch(COMMUNITY, []);
  await waitFor(() =>
    expect(box("python-analyzer")).toHaveProperty("checked", true),
  );
  expect(box("stack-analyzer").parentElement?.textContent).toContain(
    "Non inclus dans votre offre",
  );
});

it("lets the platform choose when the reader changes nothing", async () => {
  // An untouched selection sends no tools, so the run is the one the platform
  // would have started before the reader could pick.
  vi.mocked(desktop.allFiles).mockResolvedValue(["src/main.c"]);
  const runAnalysis = launch();
  await waitFor(() => expect(box("ctrace")).toHaveProperty("checked", true));
  await userEvent.click(send());
  expect(runAnalysis).toHaveBeenCalledWith("cloud", undefined, []);
});

it("lets the platform choose when the reader puts the defaults back", async () => {
  vi.mocked(desktop.allFiles).mockResolvedValue(["src/main.c"]);
  const runAnalysis = launch();
  await waitFor(() => expect(box("ctrace")).toHaveProperty("checked", true));
  await userEvent.click(box("python-analyzer"));
  await userEvent.click(box("python-analyzer"));
  await userEvent.click(send());
  expect(runAnalysis).toHaveBeenCalledWith("cloud", undefined, []);
});

it("still runs a folder where nothing was preselected", async () => {
  vi.mocked(desktop.allFiles).mockResolvedValue(["README.md"]);
  const runAnalysis = launch();
  await waitFor(() => expect(desktop.allFiles).toHaveBeenCalled());
  expect(send()).toHaveProperty("disabled", false);
  expect(screen.queryByText(/au moins un outil/)).toBeNull();
  await userEvent.click(send());
  expect(runAnalysis).toHaveBeenCalledWith("cloud", undefined, []);
});

it("sends exactly the tools the reader chose, in the platform's order", async () => {
  vi.mocked(desktop.allFiles).mockResolvedValue(["src/main.c"]);
  const runAnalysis = launch();
  await waitFor(() => expect(box("ctrace")).toHaveProperty("checked", true));
  await userEvent.click(box("typescript-analyzer"));
  await userEvent.click(box("python-analyzer"));
  await userEvent.click(box("ctrace"));
  await userEvent.click(send());
  expect(runAnalysis).toHaveBeenCalledWith("cloud", undefined, [
    "python-analyzer",
    "typescript-analyzer",
  ]);
});

it("refuses a run with no tools at all", async () => {
  vi.mocked(desktop.allFiles).mockResolvedValue(["src/main.c"]);
  launch();
  await waitFor(() => expect(box("ctrace")).toHaveProperty("checked", true));
  await userEvent.click(box("ctrace"));
  expect(send()).toHaveProperty("disabled", true);
  expect(screen.getByText(/au moins un outil/)).toBeDefined();
});

it("still offers every tool when the folder cannot be listed", async () => {
  vi.mocked(desktop.allFiles).mockRejectedValue(new Error("gone"));
  const runAnalysis = launch();
  await userEvent.click(box("ctrace"));
  await userEvent.click(send());
  expect(runAnalysis).toHaveBeenCalledWith("cloud", undefined, ["ctrace"]);
});

it("lets the platform choose when there is no catalogue to pick from", async () => {
  vi.mocked(desktop.allFiles).mockResolvedValue(["src/main.c"]);
  const runAnalysis = launch([]);
  expect(screen.queryByRole("checkbox")).toBeNull();
  await userEvent.click(send());
  expect(runAnalysis).toHaveBeenCalledWith("cloud", undefined, []);
});

it("remembers the choice for the folder the next time it is analysed", async () => {
  vi.mocked(desktop.allFiles).mockResolvedValue(["src/main.c"]);
  launch();
  await waitFor(() => expect(box("ctrace")).toHaveProperty("checked", true));
  await userEvent.click(box("python-analyzer"));
  cleanup();

  // Reopened later: a new workspace id for the same folder.
  const runAnalysis = launch(COMMUNITY, PLANS, { ...ALPHA, id: "w2" });
  await waitFor(() =>
    expect(box("python-analyzer")).toHaveProperty("checked", true),
  );
  expect(box("ctrace")).toHaveProperty("checked", true);
  await userEvent.click(send());
  expect(runAnalysis).toHaveBeenCalledWith("cloud", undefined, [
    "ctrace",
    "python-analyzer",
  ]);
});

it("keeps each folder's choice to that folder", async () => {
  vi.mocked(desktop.allFiles).mockResolvedValue(["src/main.c"]);
  launch();
  await waitFor(() => expect(box("ctrace")).toHaveProperty("checked", true));
  await userEvent.click(box("python-analyzer"));
  cleanup();

  launch(COMMUNITY, PLANS, { id: "w3", name: "beta", path: "/work/beta" });
  await waitFor(() => expect(box("ctrace")).toHaveProperty("checked", true));
  expect(box("python-analyzer")).toHaveProperty("checked", false);
});

it("drops a remembered tool the plan no longer includes", async () => {
  localStorage.setItem(
    "coretrace.cloudTools:/work/alpha",
    JSON.stringify(["ctrace", "stack-analyzer"]),
  );
  vi.mocked(desktop.allFiles).mockResolvedValue(["src/main.c"]);
  const runAnalysis = launch();
  await waitFor(() => expect(box("ctrace")).toHaveProperty("checked", true));
  expect(box("stack-analyzer")).toHaveProperty("checked", false);
  // What is left is the defaults, so the platform chooses.
  await userEvent.click(send());
  expect(runAnalysis).toHaveBeenCalledWith("cloud", undefined, []);
});

it("forgets the choice once it is back to the defaults", async () => {
  vi.mocked(desktop.allFiles).mockResolvedValue(["src/main.c"]);
  launch();
  await waitFor(() => expect(box("ctrace")).toHaveProperty("checked", true));
  await userEvent.click(box("python-analyzer"));
  expect(
    localStorage.getItem("coretrace.cloudTools:/work/alpha"),
  ).not.toBeNull();
  await userEvent.click(box("python-analyzer"));
  expect(localStorage.getItem("coretrace.cloudTools:/work/alpha")).toBeNull();
});

it("still works when the choice cannot be stored", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.mocked(desktop.allFiles).mockResolvedValue(["src/main.c"]);
  const runAnalysis = launch();
  await waitFor(() => expect(box("ctrace")).toHaveProperty("checked", true));
  await userEvent.click(box("python-analyzer"));
  await userEvent.click(send());
  expect(runAnalysis).toHaveBeenCalledWith("cloud", undefined, [
    "ctrace",
    "python-analyzer",
  ]);
});
