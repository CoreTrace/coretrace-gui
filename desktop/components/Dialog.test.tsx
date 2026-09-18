import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { ConfirmProvider, Dialog, useConfirm } from "./Dialog";

afterEach(cleanup);
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

it("opens as a native modal under its title", () => {
  render(
    <Dialog title="Titre" close={vi.fn()}>
      <p>contenu</p>
    </Dialog>,
  );
  const dialog = screen.getByRole("dialog", { name: "Titre" });
  expect(dialog.hasAttribute("open")).toBe(true);
});

it("treats a native Escape cancel the same as the close button", () => {
  const close = vi.fn();
  render(
    <Dialog title="Titre" close={close}>
      <p>contenu</p>
    </Dialog>,
  );
  const dialog = screen.getByRole("dialog", { name: "Titre" });
  const event = new Event("cancel", { cancelable: true });
  dialog.dispatchEvent(event);
  // The browser's default for an unhandled cancel is to close the dialog
  // itself, bypassing whatever close() was meant to do first.
  expect(event.defaultPrevented).toBe(true);
  expect(close).toHaveBeenCalledTimes(1);
});

it("closes from the header button", async () => {
  const close = vi.fn();
  render(
    <Dialog title="Titre" close={close}>
      <p>contenu</p>
    </Dialog>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Fermer" }));
  expect(close).toHaveBeenCalledTimes(1);
});

/** Drives useConfirm with an optional third way, and shows what it resolved. */
function Ask({ alternative }: { alternative?: string }) {
  const ask = useConfirm();
  const [answer, setAnswer] = useState("");
  return (
    <>
      <button
        onClick={async () => {
          const result = await ask(
            "Changer de dossier ?",
            "Des modifications non enregistrées seraient perdues.",
            "Changer de dossier",
            alternative,
          );
          setAnswer(String(result));
        }}
      >
        Demander
      </button>
      <p>réponse : {answer || "(en attente)"}</p>
    </>
  );
}
function show(alternative?: string) {
  render(
    <ConfirmProvider>
      <Ask alternative={alternative} />
    </ConfirmProvider>,
  );
}

it("resolves true when the reader confirms the action", async () => {
  show();
  await userEvent.click(screen.getByText("Demander"));
  screen.getByRole("dialog", { name: "Changer de dossier ?" });
  await userEvent.click(
    screen.getByRole("button", { name: "Changer de dossier" }),
  );
  await screen.findByText("réponse : true");
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("resolves false when the reader cancels, and asks nothing until asked again", async () => {
  show();
  await userEvent.click(screen.getByText("Demander"));
  await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
  await screen.findByText("réponse : false");
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("offers a third way only when one was given", async () => {
  show();
  await userEvent.click(screen.getByText("Demander"));
  expect(screen.queryByText("Enregistrer")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
});

it("resolves 'alternative' when the third way is chosen", async () => {
  show("Enregistrer");
  await userEvent.click(screen.getByText("Demander"));
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  await screen.findByText("réponse : alternative");
});
