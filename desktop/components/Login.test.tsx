import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { Login } from "./Login";
import { desktop } from "../bridge";

vi.mock("../bridge", () => ({
  native: true,
  desktop: {
    login: vi.fn(),
    pollLogin: vi.fn(),
    cancelLogin: vi.fn(() => Promise.resolve()),
    openAccount: vi.fn(() => Promise.resolve()),
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

// A short interval keeps these tests fast; only its unit (seconds) matters.
const code = {
  userCode: "BCDF-GHJK",
  verificationUri:
    "https://app.coretrace.fr/v1/auth/device/verify?user_code=BCDF-GHJK",
  interval: 0.01,
  expiresIn: 300,
};

it("shows the device code once the platform has issued one", async () => {
  vi.mocked(desktop.login).mockResolvedValue(code);
  vi.mocked(desktop.pollLogin).mockResolvedValue(false);
  render(<Login close={vi.fn()} connected={vi.fn()} />);
  expect(screen.getByText("Préparation de la connexion…")).toBeDefined();

  await screen.findByText("BCDF-GHJK");
  expect(screen.getByText("Code valable 5 minutes.")).toBeDefined();
  expect(screen.getByText(code.verificationUri)).toBeDefined();
  expect(screen.getByText(/En attente de validation/)).toBeDefined();
});

it("opens the browser to the link the code was actually issued for", async () => {
  vi.mocked(desktop.login).mockResolvedValue(code);
  vi.mocked(desktop.pollLogin).mockResolvedValue(false);
  render(<Login close={vi.fn()} connected={vi.fn()} />);
  await userEvent.click(
    await screen.findByRole("button", { name: /Ouvrir la connexion/ }),
  );
  expect(desktop.openAccount).toHaveBeenCalledWith("device");
});

it("keeps polling until the platform confirms, then hands off and closes", async () => {
  // Every poll after the first is a flat second apart, regardless of the
  // interval the platform issued — fake time so the test does not spend
  // two real seconds proving that.
  vi.useFakeTimers();
  try {
    vi.mocked(desktop.login).mockResolvedValue(code);
    vi.mocked(desktop.pollLogin)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const connected = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn();
    render(<Login close={close} connected={connected} />);

    await vi.advanceTimersByTimeAsync(10); // the first poll, at the issued interval
    expect(desktop.pollLogin).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(desktop.pollLogin).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(desktop.pollLogin).toHaveBeenCalledTimes(3);

    expect(connected).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

it("shows the platform's refusal instead of waiting on a code that will never arrive", async () => {
  vi.mocked(desktop.login).mockRejectedValue(new Error("Platform unavailable"));
  render(<Login close={vi.fn()} connected={vi.fn()} />);
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Platform unavailable");
  expect(screen.queryByText(/En attente de validation/)).toBeNull();
});

it("surfaces a polling failure without pretending sign-in is still happening", async () => {
  vi.mocked(desktop.login).mockResolvedValue(code);
  vi.mocked(desktop.pollLogin).mockRejectedValue(
    new Error("Sign-in code expired; start again"),
  );
  render(<Login close={vi.fn()} connected={vi.fn()} />);
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Sign-in code expired; start again");
});

it("gives up the native device flow as soon as the dialog goes away", async () => {
  // Nothing has confirmed the code by the time the reader closes the dialog;
  // leaving the device flow running would let a stale code sign them in later.
  vi.mocked(desktop.login).mockResolvedValue(code);
  vi.mocked(desktop.pollLogin).mockResolvedValue(false);
  const { unmount } = render(<Login close={vi.fn()} connected={vi.fn()} />);
  await screen.findByText("BCDF-GHJK");

  unmount();

  expect(desktop.cancelLogin).toHaveBeenCalledTimes(1);
});

it("still cancels the device flow if closed before the platform even issues a code", async () => {
  // login() is still pending, so no code and no poll timer exist yet; the
  // cleanup must not assume either has happened.
  vi.mocked(desktop.login).mockReturnValue(new Promise(() => {}));
  const { unmount } = render(<Login close={vi.fn()} connected={vi.fn()} />);
  await screen.findByText("Préparation de la connexion…");

  unmount();

  expect(desktop.cancelLogin).toHaveBeenCalledTimes(1);
});
