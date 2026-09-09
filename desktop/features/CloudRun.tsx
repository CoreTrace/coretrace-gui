import { Cloud, CloudUpload, Loader2, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { desktop, errorMessage, native } from "../bridge";
import type { CloudPhase } from "../types";

const IDLE: CloudPhase = { phase: "idle" };

/** Phases where something is happening and the user may want out. */
function active(phase: CloudPhase): boolean {
  return (
    phase.phase === "packing" ||
    phase.phase === "uploading" ||
    phase.phase === "verifying" ||
    phase.phase === "running"
  );
}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/**
 * Analyses the open folder in the cloud. The run stops at its price: the
 * platform quotes it and nothing is spent until the reader approves, which is
 * why the confirmation is a separate click and not a spinner.
 */
export function CloudRun({
  workspace,
  org,
  notify,
}: {
  workspace: string;
  org: string;
  notify: (message: string) => void;
}) {
  const [phase, setPhase] = useState<CloudPhase>(IDLE);
  const [busy, setBusy] = useState(false);
  const polling = useRef<ReturnType<typeof setInterval>>(undefined);

  const poll = useCallback(async () => {
    try {
      setPhase(await desktop.cloudRunStatus());
    } catch {
      // A status that cannot be read is not worth interrupting the run for.
    }
  }, []);

  useEffect(() => {
    if (!native) return;
    void poll();
    polling.current = setInterval(() => void poll(), 1000);
    return () => clearInterval(polling.current);
  }, [poll]);

  async function startRun() {
    setBusy(true);
    try {
      await desktop.startCloudRun(workspace, org);
    } catch (e) {
      notify(errorMessage(e));
    } finally {
      setBusy(false);
      await poll();
    }
  }

  async function approve() {
    setBusy(true);
    try {
      await desktop.confirmCloudRun(org);
    } catch (e) {
      notify(errorMessage(e));
    } finally {
      setBusy(false);
      await poll();
    }
  }

  async function stop() {
    try {
      await desktop.cancelCloudRun();
    } catch (e) {
      notify(errorMessage(e));
    }
    await poll();
  }

  return (
    <section className="panel">
      <h2>Analyser dans le cloud</h2>
      <p className="muted">
        Le dossier ouvert est envoyé à la plateforme et analysé avec vos CTU.
        Rien n’est débité tant que vous n’avez pas accepté le devis.
      </p>

      {phase.phase === "idle" && (
        <button className="primary" disabled={busy || !org} onClick={() => void startRun()}>
          <CloudUpload size={15} />
          {busy ? "Préparation…" : "Analyser dans le cloud"}
        </button>
      )}

      {phase.phase === "packing" && (
        <p role="status">
          <Loader2 size={14} className="spin" /> Préparation de l’archive…
        </p>
      )}
      {phase.phase === "uploading" && (
        <p role="status">
          <Loader2 size={14} className="spin" /> Envoi de {phase.files} fichiers ({megabytes(phase.total)})…
        </p>
      )}
      {phase.phase === "verifying" && (
        <p role="status">
          <Loader2 size={14} className="spin" /> Vérification par la plateforme…
        </p>
      )}

      {phase.phase === "quoted" && (
        <div className="setting-row">
          <div>
            <strong>{phase.ctu.toLocaleString("fr-FR")} CTU</strong>
            <p className="muted">
              Coût de cette analyse. Rien n’a encore été débité.
            </p>
          </div>
          <button className="primary" disabled={busy} onClick={() => void approve()}>
            <Cloud size={15} />
            {busy ? "Lancement…" : "Lancer l’analyse"}
          </button>
        </div>
      )}

      {phase.phase === "running" && (
        <p role="status">
          <Loader2 size={14} className="spin" /> Analyse en cours dans le cloud…
        </p>
      )}
      {phase.phase === "done" && <p role="status">Analyse terminée. Résultats ci-dessous.</p>}
      {phase.phase === "failed" && (
        <p role="alert" className="error">
          {phase.reason}
        </p>
      )}
      {phase.phase === "cancelled" && (
        <p role="status">
          Analyse annulée.{" "}
          {phase.spent
            ? "Elle avait déjà été lancée : les CTU réservés suivent les règles de la plateforme."
            : "Aucun CTU n’a été débité."}
        </p>
      )}

      {(active(phase) || phase.phase === "quoted") && (
        <button onClick={() => void stop()}>
          <XCircle size={15} />
          Annuler
        </button>
      )}
    </section>
  );
}
