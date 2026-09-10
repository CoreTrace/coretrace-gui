import { Cloud, CloudUpload, Loader2, XCircle } from "lucide-react";
import {
  type CloudRunModel,
  describe,
  elapsed,
  running as active,
} from "../useCloudRun";

/**
 * Analyses the open folder in the cloud. The run stops at its price: the
 * platform quotes it and nothing is spent until the reader approves, which is
 * why the confirmation is a separate click and not a spinner.
 */
/**
 * Reports the cloud run and offers its decisions. The run itself is owned above
 * the pages, so leaving this tab does not abandon it.
 *
 * The run stops at its price: the platform quotes it and nothing is spent until
 * the reader approves, which is why the confirmation is a separate click and
 * not a spinner.
 */
export function CloudRun({
  run,
  workspace,
  org,
  typical,
  showStart = true,
}: {
  run: CloudRunModel;
  workspace: string;
  org: string;
  /** Seconds a cloud analysis usually takes here, measured from finished jobs.
      Undefined when too few have run to say anything. */
  typical?: number;
  /** Whether this panel offers its own way to start a run. When the page has
      one button for every kind of analysis, this panel only reports progress
      and stays out of sight until there is some. */
  showStart?: boolean;
}) {
  const { phase, seconds, busy } = run;
  const startRun = () => void run.start(workspace, org);
  const approve = () => void run.approve(org);
  const stop = () => void run.cancel();

  // Nothing has happened and this panel cannot start anything: showing an
  // empty box headed "Analyser dans le cloud" only competes with the button
  // that does.
  if (!showStart && phase.phase === "idle") return null;

  return (
    <section className="panel">
      <h2>Analyser dans le cloud</h2>
      {showStart && (
        <p className="muted">
          Le dossier ouvert est envoyé à la plateforme et analysé avec vos CTU.
          Rien n’est débité tant que vous n’avez pas accepté le devis.
        </p>
      )}

      {showStart && phase.phase === "idle" && (
        <button className="primary" disabled={busy || !org} onClick={() => void startRun()}>
          <CloudUpload size={15} />
          {busy ? "Préparation…" : "Analyser dans le cloud"}
        </button>
      )}

      {active(phase) && phase.phase !== "running" && (
        <p role="status">
          <Loader2 size={14} className="spin" /> {describe(phase, seconds)}
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
          <Loader2 size={14} className="spin" /> {describe(phase, seconds, typical)}
          {typical !== undefined && (
            <span className="muted">
              {" "}
              (d’après vos analyses précédentes, ~{elapsed(typical)})
            </span>
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
