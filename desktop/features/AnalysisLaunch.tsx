import type { AnalyserStatus } from "../bridge";
import { Dialog } from "../components/Dialog";
import { downloadSize } from "../launch";
import type { Plan, Tool, ToolStatus, Workspace } from "../types";
import { CloudToolPicker, useToolSelection } from "./CloudToolPicker";

export type LaunchTarget = { workspace: Workspace; file?: string };

export function AnalysisLaunch({
  launch,
  analyserInfo,
  analyserError,
  localTools,
  installing,
  preparing,
  dirty,
  fileDirty,
  org,
  cloudTools = [],
  cloudPlans = [],
  launchError,
  runAnalysis,
  refreshAnalyser,
  chooseLocalAnalyser,
  cancelInstall,
  close,
  chooseFolder,
}: {
  launch: LaunchTarget;
  analyserInfo: AnalyserStatus | null;
  analyserError: string;
  localTools: ToolStatus[];
  installing: boolean;
  preparing: boolean;
  dirty: boolean;
  fileDirty: boolean;
  org?: string;
  /** The organisation's catalogue, from `GET /v1/tools`. */
  cloudTools?: Tool[];
  /** Every plan, cheapest first, from `GET /v1/plans`. */
  cloudPlans?: Plan[];
  launchError: string;
  runAnalysis: (
    mode: "local" | "cloud",
    file?: string,
    tools?: string[],
  ) => Promise<void>;
  refreshAnalyser: () => Promise<void>;
  chooseLocalAnalyser: () => Promise<void>;
  cancelInstall: () => void;
  close: () => void;
  chooseFolder: () => void;
}) {
  const localAvailable = !!(analyserInfo?.path || analyserInfo?.available);
  const localDisabled = preparing || !!analyserInfo?.prerequisite;
  const selection = useToolSelection(launch.workspace, cloudTools);
  // Left as it was, the platform decides, as it always has, even when nothing
  // was preselected. Emptied by the reader, it is a run of no tools: no run.
  const nothingChosen = selection.edited && selection.selected.length === 0;
  return (
    <Dialog title={`Analyser ${launch.workspace.name} ?`} close={close}>
      <p className="path-value">{launch.workspace.path}</p>
      <section className="launch-options">
        <div>
          <h3>Sur cette machine</h3>
          <p>
            Les fichiers restent sur cette machine. Aucun CTU n’est utilisé.
          </p>
          {analyserInfo?.path ? (
            <p className="muted">
              Analyseur {analyserInfo.installedVersion ?? "choisi manuellement"}
            </p>
          ) : analyserInfo?.available ? (
            <p>
              Pour analyser sur cette machine, CoreTrace doit télécharger son
              analyseur officiel. {analyserInfo.available.version} ·{" "}
              {downloadSize(analyserInfo.available.bytes)}
            </p>
          ) : analyserInfo ? (
            <p>
              Aucun téléchargement officiel compatible. Choisissez un exécutable
              ctrace installé.
            </p>
          ) : (
            <p role="status">
              {analyserError || "Vérification de l’analyseur…"}
            </p>
          )}
          {installing && analyserInfo?.available && (
            <div role="status">
              <p>
                {analyserInfo.received === analyserInfo.available.bytes
                  ? "Vérification et installation…"
                  : "Téléchargement de l’analyseur…"}
              </p>
              <progress
                aria-label="Téléchargement de l’analyseur"
                value={analyserInfo.received ?? 0}
                max={analyserInfo.available.bytes}
              />
              <button onClick={cancelInstall}>Annuler le téléchargement</button>
            </div>
          )}
          {analyserInfo?.prerequisite && (
            <div>
              <p role="alert">{analyserInfo.prerequisite}</p>
              <button
                disabled={preparing}
                onClick={() => void refreshAnalyser()}
              >
                Vérifier les prérequis
              </button>
            </div>
          )}
          {localTools.some((tool) => !tool.found) && (
            <p className="muted">
              Outils facultatifs absents :{" "}
              {localTools
                .filter((tool) => !tool.found)
                .map((tool) => tool.name)
                .join(", ")}
              . Le rapport ne couvrira pas leurs vérifications.
            </p>
          )}
          {dirty && (
            <p>
              Les modifications du fichier ou du dossier analysé seront
              enregistrées avant le lancement.
            </p>
          )}
          {localAvailable && (
            <div className="inline">
              <button
                className="primary"
                disabled={localDisabled}
                onClick={() => void runAnalysis("local")}
              >
                {analyserInfo?.path
                  ? dirty
                    ? "Enregistrer et analyser le dossier"
                    : "Analyser le dossier"
                  : "Télécharger et analyser le dossier"}
              </button>
              {launch.file && (
                <button
                  disabled={localDisabled}
                  onClick={() => void runAnalysis("local", launch.file)}
                >
                  {analyserInfo?.path
                    ? fileDirty
                      ? "Enregistrer et analyser"
                      : "Analyser"
                    : "Télécharger et analyser"}{" "}
                  {launch.file}
                </button>
              )}
            </div>
          )}
          {!analyserInfo?.path && (
            <button
              disabled={preparing}
              onClick={() => void chooseLocalAnalyser()}
            >
              Choisir ctrace
            </button>
          )}
          {analyserError && (
            <button disabled={preparing} onClick={() => void refreshAnalyser()}>
              Vérifier à nouveau
            </button>
          )}
        </div>
        <div>
          <h3>Dans le cloud</h3>
          <p>
            Les fichiers du dossier, hors fichiers masqués et certains
            identifiants, sont envoyés à CoreTrace Cloud avant le calcul du
            devis. Vous confirmez les CTU avant le lancement.
          </p>
          {org ? (
            <>
              <CloudToolPicker
                tools={cloudTools}
                plans={cloudPlans}
                selection={selection}
                disabled={preparing}
              />
              <button
                disabled={preparing || nothingChosen}
                onClick={() =>
                  void runAnalysis("cloud", undefined, selection.request)
                }
              >
                Envoyer le dossier et calculer le devis · {org}
              </button>
            </>
          ) : (
            <p className="muted">
              Une connexion et une organisation sont nécessaires.
            </p>
          )}
        </div>
      </section>
      {launchError && (
        <p className="error" role="alert">
          {launchError}
        </p>
      )}
      <footer>
        <button disabled={preparing} onClick={close}>
          Annuler
        </button>
        <button disabled={preparing} onClick={chooseFolder}>
          Ouvrir un autre dossier
        </button>
      </footer>
    </Dialog>
  );
}
