import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  FileCode2,
  LoaderCircle,
  Play,
  Search,
  Square,
} from "lucide-react";
import { desktop, errorMessage } from "../bridge";
import { useConfirm } from "../components/Dialog";
import {
  billed,
  date,
  duration,
  number,
  outcome,
  parseFindings,
  terminal,
} from "../model";
import type { CloudModel } from "../useCloud";
import type { Finding, Job, LocalResult, Repository } from "../types";
import { JobRows } from "./Dashboard";

export function Findings({
  findings,
  open,
}: {
  findings: Finding[];
  open: (path: string, line: number) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = findings.filter((f) =>
    `${f.message} ${f.rule} ${f.path}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <section>
      <div className="section-heading">
        <h2>
          Résultats <span className="muted">{findings.length}</span>
        </h2>
        <label className="search">
          <Search size={15} />
          <input
            aria-label="Filtrer les résultats"
            placeholder="Fichier, règle, message…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {filtered.map((f, i) => (
        <article
          className={`finding ${f.level}`}
          key={`${f.path}-${f.line}-${i}`}
        >
          <div className="inline">
            <span className={`badge ${f.level}`}>{f.level}</span>
            <span className="muted small">
              {f.tool} {f.rule}
            </span>
          </div>
          <p>{f.message}</p>
          <button
            className="text-button"
            disabled={!f.path}
            onClick={() => open(f.path, f.line)}
          >
            <FileCode2 size={13} />
            {f.path || "Sans emplacement"}:{f.line}
          </button>
        </article>
      ))}
      {!filtered.length && (
        <p className="muted">
          {findings.length
            ? "Aucun résultat ne correspond au filtre."
            : "Aucun problème signalé dans les rapports chargés."}
        </p>
      )}
    </section>
  );
}

function JobDetail({
  initial,
  cloud,
  close,
  notify,
  open,
  rerun,
}: {
  initial: Job;
  cloud: CloudModel;
  close: () => void;
  notify: (message: string) => void;
  open: (path: string, line: number) => void;
  rerun: (repo: Repository, ref: string) => void;
}) {
  const [job, setJob] = useState(initial);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [reportErrors, setReportErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [pollError, setPollError] = useState("");
  const confirm = useConfirm();
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await desktop.readCloud<Job>("job", cloud.org, initial.id);
        if (!active) return;
        setJob(next);
        setPollError("");
        if (!terminal(next)) timer = setTimeout(poll, 2500);
        else void cloud.refresh();
      } catch (e) {
        if (active) {
          setPollError(errorMessage(e));
          timer = setTimeout(poll, 5000);
        }
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [initial.id, cloud.org]);
  const finished = terminal(job);
  useEffect(() => {
    if (!finished) return;
    let active = true;
    setLoading(true);
    setReportErrors([]);
    void Promise.allSettled(
      job.runs.map(async (run) =>
        parseFindings(
          await desktop.report(cloud.org, job.id, run.id),
          run.tool,
        ),
      ),
    ).then((results) => {
      if (!active) return;
      setFindings(
        results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
      );
      setReportErrors(
        results.flatMap((r, i) =>
          r.status === "rejected"
            ? [`${job.runs[i].tool} : ${errorMessage(r.reason)}`]
            : [],
        ),
      );
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [finished, job.id, cloud.org]);
  const repository = cloud.repositories.find(
    (r) => r.full_name === job.source?.repo_full_name,
  );
  const cancel = async () => {
    if (
      !(await confirm(
        "Annuler cette analyse ?",
        "Les CTU déjà consommés restent facturés.",
        "Arrêter l’analyse",
      ))
    )
      return;
    try {
      await desktop.cancelCloud(cloud.org, job.id);
      setJob(await desktop.readCloud<Job>("job", cloud.org, job.id));
    } catch (e) {
      notify(errorMessage(e));
    }
  };
  return (
    <>
      <button className="text-button" onClick={close}>
        <ArrowLeft size={16} />
        Toutes les analyses
      </button>
      <div className="page-heading">
        <div>
          <h1>{job.source?.repo_full_name ?? "Analyse cloud"}</h1>
          <p>
            {job.source?.ref ?? job.source?.commit_sha} · {date(job.created_at)}
          </p>
        </div>
        <span className={`badge ${job.conclusion ?? job.status}`}>
          {outcome(job)}
        </span>
      </div>
      <div className="analysis-summary">
        <span>{number(billed(job))} CTU facturés</span>
        <span>{duration(job)}</span>
        <span>
          {job.runs.filter((r) => r.finished_at).length} / {job.runs.length}{" "}
          outils terminés
        </span>
        {!finished && (
          <button onClick={() => void cancel()}>
            <Square size={13} />
            Annuler
          </button>
        )}
        {finished && repository?.enabled && (
          <button
            onClick={() =>
              rerun(
                repository,
                job.source?.ref ??
                  job.source?.commit_sha ??
                  repository.default_branch,
              )
            }
          >
            <Play size={13} />
            Relancer
          </button>
        )}
      </div>
      {pollError && (
        <p role="alert" className="error">
          {pollError} · Nouvelle tentative automatique.
        </p>
      )}
      {job.rejection_reason && (
        <p className="error">
          La plateforme a refusé l’analyse : {job.rejection_reason}
        </p>
      )}
      {job.conclusion === "capped" && (
        <p className="notice">
          Le plafond CTU a été atteint. Les résultats peuvent être incomplets.
        </p>
      )}
      {!finished && (
        <div className="notice inline">
          <LoaderCircle size={16} className="spin" />
          L’analyse est en cours. Les résultats seront chargés à sa fin.
        </div>
      )}
      {loading && <p className="muted">Chargement des rapports…</p>}
      {reportErrors.map((error) => (
        <p className="error small" key={error}>
          {error}
        </p>
      ))}
      {finished &&
        !loading &&
        (findings.length > 0 ||
          (!reportErrors.length && job.runs.length > 0)) && (
          <Findings findings={findings} open={open} />
        )}
      <details className="tool-runs">
        <summary>Exécution des outils · {job.runs.length}</summary>
        {job.runs.map((run) => (
          <div className="tool-run" key={run.id}>
            <strong>{run.tool}</strong>
            <span>{run.execution_outcome ?? run.execution_status}</span>
            <span>{number(run.billed_ctu)} CTU</span>
            {run.execution_outcome === "tool_error" && (
              <p className="error">
                L’outil a échoué. Consultez son rapport lorsqu’il est
                disponible.
              </p>
            )}
          </div>
        ))}
      </details>
    </>
  );
}

export function Analyses({
  cloud,
  selected,
  select,
  initialRepository,
  initialRef,
  clearDraft,
  notify,
  openFinding,
  local,
  localRunning,
  openWorkspace,
}: {
  cloud: CloudModel;
  selected: Job | null;
  select: (job: Job | null) => void;
  initialRepository: Repository | null;
  initialRef: string;
  clearDraft: () => void;
  notify: (message: string) => void;
  openFinding: (path: string, line: number) => void;
  local: LocalResult | null;
  localRunning: boolean;
  openWorkspace: () => void;
}) {
  const [repositoryId, setRepositoryId] = useState(initialRepository?.id ?? "");
  const [reference, setReference] = useState(
    initialRef || initialRepository?.default_branch || "",
  );
  const [rerun, setRerun] = useState(!!initialRef);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("");
  const confirm = useConfirm();
  const localReport = useMemo(() => {
    try {
      return {
        findings: local?.report ? parseFindings(local.report) : [],
        error: "",
      };
    } catch (e) {
      return { findings: [], error: errorMessage(e) };
    }
  }, [local]);
  useEffect(() => {
    if (initialRepository) {
      setRepositoryId(initialRepository.id);
      setReference(initialRef || initialRepository.default_branch);
      setRerun(!!initialRef);
      setRequestId(crypto.randomUUID());
    }
  }, [initialRepository, initialRef]);
  const run = async () => {
    const repo = cloud.repositories.find((r) => r.id === repositoryId);
    if (!repo || !reference.trim()) return;
    if (
      !(await confirm(
        rerun
          ? "Relancer cette analyse cloud ?"
          : "Lancer cette analyse cloud ?",
        `${repo.full_name} · ${reference}. La plateforme analysera le commit distant et débitera les CTU de ${cloud.org}, selon sa configuration et ses plafonds. Les modifications locales ne seront pas envoyées.`,
        "Lancer l’analyse",
      ))
    )
      return;
    setRunning(true);
    try {
      const job = await desktop.analyseCloud(
        cloud.org,
        repo.installation,
        repo.id,
        reference.trim(),
        rerun,
        requestId,
      );
      select(job);
      setRequestId(crypto.randomUUID());
      clearDraft();
      void cloud.refresh();
    } catch (e) {
      notify(errorMessage(e));
    } finally {
      setRunning(false);
    }
  };
  const prepareRerun = (repo: Repository, ref: string) => {
    setRepositoryId(repo.id);
    setReference(ref);
    setRerun(true);
    setRequestId(crypto.randomUUID());
    select(null);
  };
  return (
    <div className="page">
      {selected ? (
        <JobDetail
          key={`${cloud.org}/${selected.id}`}
          initial={selected}
          cloud={cloud}
          close={() => select(null)}
          notify={notify}
          open={openFinding}
          rerun={prepareRerun}
        />
      ) : (
        <>
          <div className="page-heading">
            <div>
              <div className="eyebrow">COMPRENDRE & CORRIGER</div>
              <h1>Analyses</h1>
              <p>Exécutez les outils CoreTrace et retrouvez leurs résultats.</p>
            </div>
            <button onClick={openWorkspace}>
              <FileCode2 size={16} />
              Analyser un fichier local
            </button>
          </div>
          <section className="panel">
            <div className="section-heading">
              <h2>Nouvelle analyse cloud</h2>
              <span className="badge">{cloud.org || "Connexion requise"}</span>
            </div>
            <div className="run-form">
              <label>
                Dépôt
                <select
                  value={repositoryId}
                  disabled={running}
                  onChange={(e) => {
                    setRepositoryId(e.target.value);
                    setReference(
                      cloud.repositories.find((r) => r.id === e.target.value)
                        ?.default_branch ?? "",
                    );
                    setRequestId(crypto.randomUUID());
                  }}
                >
                  <option value="">Sélectionnez un dépôt</option>
                  {cloud.repositories
                    .filter((r) => r.enabled)
                    .map((repo) => (
                      <option key={repo.id} value={repo.id}>
                        {repo.full_name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Branche, tag ou commit
                <input
                  value={reference}
                  disabled={running}
                  placeholder="main"
                  onChange={(e) => {
                    setReference(e.target.value);
                    setRequestId(crypto.randomUUID());
                  }}
                />
              </label>
              <button
                className="primary"
                disabled={
                  running || !repositoryId || !reference.trim() || !cloud.me
                }
                onClick={() => void run()}
              >
                {running ? (
                  <LoaderCircle size={15} className="spin" />
                ) : (
                  <Play size={15} />
                )}
                {running ? "Envoi…" : "Lancer l’analyse"}
              </button>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={rerun}
                disabled={running}
                onChange={(e) => {
                  setRerun(e.target.checked);
                  setRequestId(crypto.randomUUID());
                }}
              />
              Relancer même si ce commit a déjà été analysé
            </label>
            <p className="muted small">
              Les outils sont définis par la configuration du dépôt sur la
              plateforme. Chaque exécution peut consommer des CTU.
            </p>
            {!cloud.repositories.some((r) => r.enabled) && (
              <p className="notice">
                Connectez et activez un dépôt depuis la page Dépôts pour lancer
                une analyse cloud.
              </p>
            )}
          </section>
          {localRunning && (
            <div className="notice inline">
              <LoaderCircle size={16} className="spin" />
              Analyse locale en cours…
              <button
                onClick={() =>
                  void desktop
                    .cancelLocal()
                    .catch((e) => notify(errorMessage(e)))
                }
              >
                Arrêter
              </button>
            </div>
          )}
          {local && (
            <section className="panel">
              <div className="section-heading">
                <h2>Dernière analyse locale</h2>
                <span
                  className={`badge ${local.cancelled ? "cancelled" : local.warnings?.length ? "warning" : local.exitCode === 0 ? "clean" : "failed"}`}
                >
                  {local.cancelled
                    ? "Annulée"
                    : local.warnings?.length
                      ? "Analyse incomplète"
                      : `Code de sortie ${local.exitCode ?? "inconnu"}`}
                </span>
              </div>
              {local.warnings?.map((warning) => (
                <p className="notice" role="alert" key={warning}>
                  {warning}
                </p>
              ))}
              {local.report && !localReport.error ? (
                <Findings findings={localReport.findings} open={openFinding} />
              ) : (
                <p className="muted">
                  Aucun rapport structuré produit. Consultez la sortie de
                  l’outil.
                </p>
              )}
              {localReport.error && (
                <p className="error" role="alert">
                  {localReport.error}
                </p>
              )}
              <details open={!!local.warnings?.length}>
                <summary>Sortie de ctrace</summary>
                <pre>
                  {local.stdout}
                  {"\n"}
                  {local.stderr}
                </pre>
              </details>
            </section>
          )}
          <div className="section-heading">
            <h2>Historique de l’organisation</h2>
            <div className="inline">
              <input
                aria-label="Filtrer par dépôt"
                placeholder="Rechercher un dépôt…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <select
                aria-label="Filtrer par statut"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Tous les statuts</option>
                <option value="running">En cours</option>
                <option value="completed">Terminées</option>
                <option value="rejected">Refusées</option>
                <option value="cancelled">Annulées</option>
              </select>
            </div>
          </div>
          <JobRows
            jobs={cloud.jobs.filter(
              (job) =>
                (job.source?.repo_full_name ?? "")
                  .toLowerCase()
                  .includes(filter.toLowerCase()) &&
                (!status ||
                  (status === "running"
                    ? !terminal(job)
                    : job.status === status)),
            )}
            select={select}
          />
          {cloud.jobs.length >= 200 && (
            <p className="muted small">
              Affichage des 200 analyses les plus récentes.
            </p>
          )}
        </>
      )}
    </div>
  );
}
