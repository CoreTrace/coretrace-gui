import { Cloud, CloudUpload, Loader2, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { desktop, errorMessage, native } from "../bridge";
import type { CloudPhase } from "../types";

const IDLE: CloudPhase = { phase: "idle" };

/**
 * Runs whose results have already been opened. Outside the component on
 * purpose: leaving the tab unmounts the panel, and a ref inside would forget,
 * so returning re-opened the finished analysis and the list became unreachable.
 */
const opened = new Set<string>();

/** Phases where something is happening and the user may want out. */
function active(phase: CloudPhase): boolean {
  return (
    phase.phase === "packing" ||
    phase.phase === "uploading" ||
    phase.phase === "verifying" ||
    phase.phase === "quoting" ||
    phase.phase === "running"
  );
}

function megabytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} Ko`
    : `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/** mm:ss since a phase began. */
function elapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} min ${String(s).padStart(2, "0")} s` : `${s} s`;
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
  onFinished,
  typical,
}: {
  workspace: string;
  org: string;
  notify: (message: string) => void;
  /** Called once when a run finishes, so its results can be opened. */
  onFinished: (job: string) => void;
  /** Seconds a cloud analysis usually takes here, measured from finished jobs.
      Undefined when too few have run to say anything. */
  typical?: number;
}) {
  const [phase, setPhase] = useState<CloudPhase>(IDLE);
  const [busy, setBusy] = useState(false);
  const polling = useRef<ReturnType<typeof setInterval>>(undefined);
  // Animations may be switched off system-wide, and then nothing can turn. A
  // count that ticks every second is motion the reader can trust: it is the
  // real elapsed time, not decoration.
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef<number>(Date.now());

  const poll = useCallback(async () => {
    try {
      setPhase(await desktop.cloudRunStatus());
    } catch {
      // A status that cannot be read is not worth interrupting the run for.
    }
  }, []);

  useEffect(() => {
    if (!active(phase)) {
      setSeconds(0);
      startedAt.current = Date.now();
      return;
    }
    const tick = setInterval(
      () => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)),
      1000,
    );
    return () => clearInterval(tick);
  }, [phase]);

  useEffect(() => {
    if (phase.phase === "done" && !opened.has(phase.job)) {
      opened.add(phase.job);
      onFinished(phase.job);
    }
  }, [phase, onFinished]);

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
          <Loader2 size={14} className="spin" /> Préparation de l’archive :{" "}
          {phase.files} fichiers ({megabytes(phase.bytes)}) · {elapsed(seconds)}
        </p>
      )}
      {phase.phase === "uploading" && (
        <p role="status">
          <Loader2 size={14} className="spin" /> Envoi de {phase.files} fichiers
          ({megabytes(phase.total)}) · {elapsed(seconds)}
        </p>
      )}
      {phase.phase === "verifying" && (
        <p role="status">
          <Loader2 size={14} className="spin" /> Vérification par la plateforme ·{" "}
          {elapsed(seconds)}
        </p>
      )}

      {phase.phase === "quoting" && (
        <p role="status">
          <Loader2 size={14} className="spin" /> Calcul du coût · {elapsed(seconds)}
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
          <Loader2 size={14} className="spin" /> Analyse en cours dans le cloud ·{" "}
          {elapsed(seconds)}
          {typical !== undefined && (
            <>
              {" · "}
              {seconds < typical
                ? `environ ${elapsed(typical - seconds)} restant`
                : "plus longue que d’habitude"}
              <span className="muted">
                {" "}
                (d’après vos analyses précédentes, ~{elapsed(typical)})
              </span>
            </>
          )}
        </p>
      )}
      {phase.phase === "done" && (
        <p role="status">Analyse terminée. Les résultats sont ouverts.</p>
      )}
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
