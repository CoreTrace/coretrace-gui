import {
  ArrowRight,
  Building2,
  FolderOpen,
  GitBranch,
  ShieldCheck,
  Play,
  Sparkles,
} from "lucide-react";
import type { CloudModel } from "../useCloud";
import type { Job, Page, Workspace } from "../types";
import {
  accessLabel,
  billed,
  date,
  number,
  outcome,
  roleLabel,
  usage,
} from "../model";

export function JobRows({
  jobs,
  select,
}: {
  jobs: Job[];
  select: (job: Job) => void;
}) {
  if (!jobs.length)
    return (
      <div className="empty">
        <ShieldCheck size={26} />
        <p>Aucune analyse à afficher.</p>
        <span className="muted small">
          Vos prochains résultats apparaîtront ici.
        </span>
      </div>
    );
  return (
    <div className="job-rows">
      {jobs.map((job) => (
        <button className="job-row" key={job.id} onClick={() => select(job)}>
          <div className="job-symbol">
            <GitBranch size={17} />
          </div>
          <div className="grow">
            <strong>
              {job.source?.repo_full_name ?? job.label ?? "Sources importées"}
            </strong>
            <span className="muted small">
              {job.source?.ref ??
                job.source?.commit_sha?.slice(0, 8) ??
                "Analyse cloud"}{" "}
              · {date(job.created_at)}
            </span>
          </div>
          <span className={`badge ${job.conclusion ?? job.status}`}>
            {outcome(job)}
          </span>
          <span className="cost">{number(billed(job))} CTU</span>
          <ArrowRight size={15} />
        </button>
      ))}
    </div>
  );
}
export function Dashboard({
  cloud,
  workspace,
  navigate,
  openFolder,
  clone,
  analyse,
  login,
  selectJob,
}: {
  cloud: CloudModel;
  workspace: Workspace | null;
  navigate: (page: Page) => void;
  openFolder: () => void;
  clone: () => void;
  /** Starts an analysis of the open folder, or opens one when none is. */
  analyse: () => void;
  login: () => void;
  selectJob: (job: Job) => void;
}) {
  const summary = cloud.limits ? usage(cloud.limits) : null;
  const allowance = summary?.allowance;
  const fraction =
    allowance && summary
      ? Math.min(100, (summary.remaining / allowance) * 100)
      : 0;
  const member = cloud.me?.orgs.find((o) => o.slug === cloud.org);
  return (
    <div className="page dashboard">
      <div className="eyebrow">
        <span className="status-dot" />
        VOTRE ESPACE DE TRAVAIL
      </div>
      <div className="hero">
        <div>
          <h1>
            {`Bonjour${cloud.me?.principal.name ? `, ${cloud.me.principal.name}` : ""}.`}
            <br />
            <span>Que souhaitez-vous analyser ?</span>
          </h1>
          <p>
            Ouvrez votre code. Lancez une analyse. Comprenez chaque résultat.
          </p>
        </div>
        {workspace && (
          <button className="primary" onClick={analyse}>
            <Play size={16} />
            Analyser {workspace.name}
          </button>
        )}
      </div>
      {!cloud.me && (
        <div className="connection-banner">
          <div>
            <strong>Retrouvez votre espace CoreTrace</strong>
            <p>
              Connectez-vous pour accéder aux organisations, aux quotas et aux
              analyses cloud.
            </p>
          </div>
          <button onClick={login}>
            Se connecter <ArrowRight size={15} />
          </button>
        </div>
      )}
      {cloud.me && (
        <>
          <div className="section-heading">
            <h2>Votre organisation</h2>
            <button
              className="text-button"
              onClick={() => navigate("settings")}
            >
              {cloud.org || "Choisir une organisation"} <ArrowRight size={14} />
            </button>
          </div>
          <div className="metrics">
            <article>
              <span className="muted">CTU disponibles</span>
              <strong>{summary ? number(summary.remaining) : "—"}</strong>
              <div className="meter" aria-label="Quota restant">
                <span style={{ width: `${fraction}%` }} />
              </div>
              <span className="small muted">
                {allowance != null
                  ? `sur ${number(allowance)} CTU pour cette période`
                  : "Allocation de période non communiquée"}
              </span>
            </article>
            <article>
              <span className="muted">Consommation de la période</span>
              <strong>
                {summary?.used != null ? number(summary.used) : "—"}{" "}
                <small>CTU</small>
              </strong>
              <span className="small muted">
                {cloud.limits
                  ? `Renouvellement le ${new Date(cloud.limits.period_ends_at).toLocaleDateString("fr-FR")}`
                  : "Connexion à la plateforme nécessaire"}
              </span>
            </article>
            <article>
              <span className="muted">Plan actuel</span>
              <strong className="plan-name">{cloud.limits?.plan ?? "—"}</strong>
              <span className="small muted">
                <Building2 size={13} />{" "}
                {member
                  ? `${roleLabel(member.role)} · ${accessLabel(member.access_state)}`
                  : "Aucune organisation sélectionnée"}
              </span>
            </article>
          </div>
          {summary &&
            allowance != null &&
            summary.remaining < allowance / 10 && (
              <div className="notice">
                Votre quota est presque épuisé. Consultez les limites de votre
                organisation avant de relancer une analyse.
              </div>
            )}
        </>
      )}
      {!workspace && (
        <>
          <div className="action-grid">
            <button className="action-card" onClick={openFolder}>
              <span className="action-icon brand-accent">
                <FolderOpen size={23} />
              </span>
              <strong>Ouvrir un dossier</strong>
              <span>Travaillez sur votre code local dans l’IDE intégré.</span>
              <ArrowRight size={18} />
            </button>
            <button className="action-card" onClick={clone}>
              <span className="action-icon brand-accent">
                <GitBranch size={23} />
              </span>
              <strong>Cloner un dépôt GitHub</strong>
              <span>
                Copiez un dépôt sur cette machine pour l’ouvrir et l’analyser.
              </span>
              <ArrowRight size={18} />
            </button>
            <button className="action-card" onClick={analyse}>
              <span className="action-icon brand-accent">
                <Sparkles size={23} />
              </span>
              <strong>Lancer une analyse</strong>
              <span>Choisissez un dossier, puis analysez-le.</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </>
      )}
      {workspace && (
        <button className="resume-card" onClick={() => navigate("workspace")}>
          <FolderOpen size={20} />
          <div className="grow">
            <strong>Reprendre {workspace.name}</strong>
            <span className="muted small">{workspace.path}</span>
          </div>
          <ArrowRight size={18} />
        </button>
      )}
      <div className="section-heading">
        <div>
          <h2>Analyses récentes</h2>
          <p className="muted small">
            {cloud.me
              ? "Les derniers résultats de l’organisation sélectionnée."
              : "Connectez-vous pour retrouver votre historique."}
          </p>
        </div>
        <button className="text-button" onClick={() => navigate("analyses")}>
          Tout voir <ArrowRight size={14} />
        </button>
      </div>
      <JobRows jobs={cloud.jobs.slice(0, 10)} select={selectJob} />
    </div>
  );
}
