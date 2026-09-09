import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { desktop } from "../bridge";
import { Settings } from "./Settings";
import type { CloudModel } from "../useCloud";
vi.mock("../bridge", () => ({
  native: true,
  desktop: {
    analysisOptions: vi.fn(() =>
      Promise.resolve({ config: null, compileCommands: null }),
    ),
    readCloud: vi.fn(() => Promise.resolve([])),
    connectGitHub: vi.fn(() => Promise.resolve("https://github.com/login/oauth/authorize")),
    cloneLocation: vi.fn(() => Promise.resolve("/home/me/.local/share/CoreTrace/repositories")),
  },
  errorMessage: (e: unknown) => String(e),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function show(me: unknown) {
  render(
    <Settings
      cloud={{ org: "alpha", me, reconnect: vi.fn() } as unknown as CloudModel}
      analyser=""
      setAnalyser={vi.fn()}
      login={vi.fn()}
      notify={vi.fn()}
    />,
  );
}
// The platform sets principal.name for API keys only, so every signed-in human
// arrives with a null name. Falling back to "Non connecté" told the user they
// were signed out while their session was live.
it("identifies a signed-in user the platform gives no name", () => {
  show({
    principal: { kind: "user" },
    email: "cedric.roulof1@gmail.com",
    orgs: [{ slug: "alpha" }],
  });
  expect(screen.getByText("cedric.roulof1@gmail.com")).toBeDefined();
  expect(screen.queryByText("Non connecté")).toBeNull();
});
it("says nothing is signed in when there is no session", () => {
  show(null);
  expect(screen.getByText("Non connecté")).toBeDefined();
});

it("offers a GitHub pill and opens the authorisation in the browser", async () => {
  const connect = vi.mocked(desktop.connectGitHub);
  connect.mockResolvedValue("https://github.com/login/oauth/authorize?client_id=Iv1");
  show({
    principal: { kind: "user" },
    email: "cedric@example.test",
    orgs: [{ slug: "alpha" }],
    identities: ["https://accounts.google.com"],
  });
  const pill = screen.getByRole("button", { name: /Connecter GitHub/ });
  await userEvent.click(pill);
  expect(connect).toHaveBeenCalled();
});

it("says GitHub is connected instead of offering to connect it again", () => {
  show({
    principal: { kind: "user" },
    email: "cedric@example.test",
    orgs: [{ slug: "alpha" }],
    identities: ["https://accounts.google.com", "https://github.com"],
  });
  expect(screen.getByText("GitHub connecté")).toBeDefined();
  expect(screen.queryByRole("button", { name: /Connecter GitHub/ })).toBeNull();
});

it("says where cloned repositories are kept", async () => {
  // Clones no longer ask for a folder, so the one they go to has to be visible
  // somewhere; otherwise the user cannot find what they just cloned.
  show({ principal: { kind: "user" }, email: "c@example.test", orgs: [] });
  expect(
    await screen.findByText("/home/me/.local/share/CoreTrace/repositories"),
  ).toBeDefined();
});
