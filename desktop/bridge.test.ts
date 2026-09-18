import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { invoke, isTauri } = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri }));

// `native` is read once, at import time, so each test re-imports the module
// after setting isTauri's answer for that test.
beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.clearAllMocks();
});

it("calls the native command by name, with its arguments, when running in Tauri", async () => {
  isTauri.mockReturnValue(true);
  invoke.mockResolvedValue([{ id: "w1", name: "alpha", path: "/work/alpha" }]);
  const { desktop } = await import("./bridge");

  const result = await desktop.workspaces();

  expect(invoke).toHaveBeenCalledWith("workspaces", undefined);
  expect(result).toEqual([{ id: "w1", name: "alpha", path: "/work/alpha" }]);
});

it("carries every argument through to the command untouched", async () => {
  isTauri.mockReturnValue(true);
  invoke.mockResolvedValue({ content: "int main(){}", revision: "abc" });
  const { desktop } = await import("./bridge");

  await desktop.save("w1", "src/main.c", "int main(){}", "abc");

  expect(invoke).toHaveBeenCalledWith("save_file", {
    workspaceId: "w1",
    path: "src/main.c",
    content: "int main(){}",
    revision: "abc",
  });
});

it("refuses every action outside the desktop app, without reaching the native bridge", async () => {
  isTauri.mockReturnValue(false);
  const { desktop } = await import("./bridge");

  await expect(desktop.workspaces()).rejects.toThrow(
    "Cette action nécessite l’application desktop. Lancez npm start.",
  );
  expect(invoke).not.toHaveBeenCalled();
});

it("answers signed-out instead of refusing, for the one call the web build still needs", async () => {
  isTauri.mockReturnValue(false);
  const { desktop } = await import("./bridge");

  await expect(desktop.status()).resolves.toEqual({
    signedIn: false,
    baseUrl: "https://api.coretrace.fr/v1",
  });
  expect(invoke).not.toHaveBeenCalled();
});

it("still asks the native bridge for status when running in Tauri", async () => {
  isTauri.mockReturnValue(true);
  invoke.mockResolvedValue({
    signedIn: true,
    baseUrl: "https://api.coretrace.fr/v1",
  });
  const { desktop } = await import("./bridge");

  await expect(desktop.status()).resolves.toEqual({
    signedIn: true,
    baseUrl: "https://api.coretrace.fr/v1",
  });
  expect(invoke).toHaveBeenCalledWith("cloud_status", undefined);
});

it("runs every rejection through the same French translation table as the rest of the app", async () => {
  isTauri.mockReturnValue(true);
  const { errorMessage } = await import("./bridge");

  expect(errorMessage(new Error("An analysis is already running"))).toBe(
    "Une analyse est déjà en cours.",
  );
  expect(errorMessage("Something new happened")).toBe("Something new happened");
});
