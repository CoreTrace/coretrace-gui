import { describe as suite, expect, it } from "vitest";
import { describe, elapsed, running } from "./useCloudRun";

suite("describe", () => {
  it("names every working phase with a figure that changes", () => {
    // A frozen line reads as a hang when animations are off; each of these
    // carries a count, a size or the clock so the reader can see it move.
    expect(describe({ phase: "packing", files: 40, bytes: 2048 }, 3)).toBe(
      "Préparation de l’archive : 40 fichiers (2 Ko) · 3 s",
    );
    expect(describe({ phase: "uploading", files: 40, total: 3 * 1024 * 1024 }, 65)).toBe(
      "Envoi de 40 fichiers (3.0 Mo) · 1 min 05 s",
    );
    expect(describe({ phase: "verifying" }, 2)).toBe("Vérification par la plateforme · 2 s");
    expect(describe({ phase: "quoting" }, 7)).toBe("Calcul du coût · 7 s");
  });

  it("estimates the remaining time only from measured runs", () => {
    expect(describe({ phase: "running", job: "j" }, 10)).toBe(
      "Analyse en cours dans le cloud · 10 s",
    );
    expect(describe({ phase: "running", job: "j" }, 10, 40)).toBe(
      "Analyse en cours dans le cloud · 10 s · environ 30 s restant",
    );
    expect(describe({ phase: "running", job: "j" }, 50, 40)).toBe(
      "Analyse en cours dans le cloud · 50 s · plus longue que d’habitude",
    );
  });

  it("says nothing when nothing is happening", () => {
    expect(describe({ phase: "idle" }, 0)).toBeNull();
    expect(describe({ phase: "done", job: "j" }, 0)).toBeNull();
    expect(running({ phase: "quoted", job: "j", ctu: 1, deadline: "" })).toBe(false);
    expect(elapsed(0)).toBe("0 s");
  });
});
