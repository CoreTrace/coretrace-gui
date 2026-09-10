import { expect, it } from "vitest";
import { translateError } from "./errors";

it("says the desktop's English answers in French", () => {
  expect(translateError("An analysis is already running")).toBe(
    "Une analyse est déjà en cours.",
  );
  expect(
    translateError("Choose the installed ctrace executable in Settings first"),
  ).toBe("Choisissez d’abord le programme ctrace dans les paramètres.");
});

it("keeps what a tool itself said as a detail", () => {
  expect(
    translateError(
      "Git clone failed. For private repositories, sign in first. fatal: repository not found",
    ),
  ).toBe(
    "Le clonage Git a échoué — For private repositories, sign in first. fatal: repository not found",
  );
  expect(translateError("Cannot start ctrace: os error 2")).toBe(
    "Impossible de lancer ctrace — os error 2",
  );
});

it("passes through what it does not know rather than hiding it", () => {
  expect(translateError("Something new happened")).toBe(
    "Something new happened",
  );
});
