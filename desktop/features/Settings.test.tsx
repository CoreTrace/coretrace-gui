import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Settings } from "./Settings";
import type { CloudModel } from "../useCloud";
vi.mock("../bridge", () => ({
  native: false,
  desktop: {
    analysisOptions: vi.fn(() =>
      Promise.resolve({ config: null, compileCommands: null }),
    ),
    readCloud: vi.fn(() => Promise.resolve([])),
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
      cloud={{ org: "alpha", me } as unknown as CloudModel}
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
