import type { Finding, Job, Limits } from "./types";

export const terminal = (job: Job) =>
  ["completed", "cancelled", "rejected"].includes(job.status);
/**
 * What a job has cost. The listing carries no runs, so summing them reported
 * zero for every past analysis; the platform now puts the total on the job and
 * the runs are only a fallback for an older platform.
 */
export const billed = (job: Job) =>
  job.billed_ctu ?? job.runs.reduce((sum, run) => sum + run.billed_ctu, 0);
const labels: Record<string, string> = {
  completed: "Terminée",
  clean: "Aucun problème",
  findings: "Problèmes détectés",
  failed: "Échec",
  capped: "Plafond atteint",
  rejected: "Refusée",
  cancelled: "Annulée",
  running: "En cours",
  queued: "En attente",
  awaiting_confirmation: "À confirmer",
  preparing: "Préparation",
  metering: "Calcul CTU",
  succeeded: "Terminée",
  // Every status and conclusion the platform sends. One missing value shows the
  // reader an English word in a French interface.
  partial: "Partiellement analysé",
  preparing_input: "Préparation des sources",
  quoting: "Estimation du coût",
  finalizing: "Finalisation",
};
export const outcome = (job: Job) =>
  labels[job.conclusion ?? job.status] ?? job.status.replaceAll("_", " ");
export const number = (value: number) =>
  new Intl.NumberFormat("fr-FR").format(value);
export const date = (value: string) =>
  new Date(value).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export function usage(limits: Limits) {
  // Missing period figures are unknown, never reconstructed from a policy ceiling.
  return {
    remaining: Math.max(0, limits.remaining_budget_ctu),
    allowance: limits.period_allowance_ctu,
    used: limits.period_used_ctu,
  };
}
export function duration(job: Job): string {
  if (
    !job.runs.length ||
    job.runs.some((run) => !run.started_at || !run.finished_at)
  )
    return "—";
  const ms =
    Math.max(...job.runs.map((run) => Date.parse(run.finished_at!))) -
    Math.min(...job.runs.map((run) => Date.parse(run.started_at!)));
  return `${Math.max(0, Math.round(ms / 1000))} s`;
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}
export function parseFindings(
  text: string,
  tool?: string,
  origin?: "local" | "cloud",
): Finding[] {
  const finding = (value: unknown): Finding | null => {
    if (
      !record(value) ||
      !record(value.location) ||
      typeof value.message !== "string" ||
      typeof value.location.path !== "string" ||
      typeof value.location.line !== "number"
    )
      return null;
    return {
      rule: String(value.rule_id ?? ""),
      level: String(value.level ?? "note"),
      message: value.message,
      path: value.location.path,
      line: value.location.line,
      tool,
      origin,
    };
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const findings = text.split("\n").flatMap((line) => {
      try {
        const f = finding(JSON.parse(line));
        return f ? [f] : [];
      } catch {
        return [];
      }
    });
    if (!findings.length && text.trim())
      throw new Error(
        "Rapport illisible : aucun résultat valide n’a pu être chargé.",
      );
    return findings;
  }
  if (!record(parsed)) throw new Error("Format de rapport non reconnu.");
  if (Array.isArray(parsed.findings))
    return parsed.findings.map(finding).filter((f): f is Finding => f !== null);
  if (Array.isArray(parsed.runs)) {
    return parsed.runs.flatMap((run) => {
      if (!record(run) || !Array.isArray(run.results)) return [];
      return run.results.flatMap((result) => {
        if (
          !record(result) ||
          !record(result.message) ||
          typeof result.message.text !== "string"
        )
          return [];
        const location = Array.isArray(result.locations)
          ? result.locations[0]?.physicalLocation
          : undefined;
        return [
          {
            rule: String(result.ruleId ?? ""),
            level: String(result.level ?? "warning"),
            message: result.message.text,
            path: String(location?.artifactLocation?.uri ?? ""),
            line: Number(location?.region?.startLine ?? 1),
            tool,
          },
        ];
      });
    });
  }
  const single = finding(parsed);
  if (!single) throw new Error("Format de rapport non reconnu.");
  return [single];
}

export function workspaceRelativePath(value: string, root: string): string {
  let path = value;
  if (path.startsWith("file://")) {
    const uri = new URL(path);
    if (uri.hostname && uri.hostname !== "localhost")
      throw new Error("Le résultat désigne un fichier sur une autre machine.");
    path = uri.pathname.replace(/^\/([a-z]:)/i, "$1");
  }
  path = decodeURIComponent(path).replaceAll("\\", "/");
  const base = root
    .replace(/^\\\\\?\\/, "")
    .replaceAll("\\", "/")
    .replace(/\/$/, "");
  if (path.startsWith("/") || /^[a-z]:/i.test(path)) {
    const windows = /^[a-z]:/i.test(base);
    const match = windows ? path.toLowerCase() : path;
    const prefix = (windows ? base.toLowerCase() : base) + "/";
    if (!match.startsWith(prefix))
      throw new Error(
        "Ce résultat appartient à un autre dossier. Ouvrez le dossier correspondant.",
      );
    path = path.slice(base.length + 1);
  }
  path = path.replace(/^(\.\/)+/, "");
  if (!path || path.split("/").includes("..") || path.includes(":"))
    throw new Error("Emplacement de résultat invalide.");
  return path;
}

/**
 * How long a cloud analysis usually takes for this organisation, in seconds,
 * from the jobs it has actually run. Undefined when too few have finished to
 * say anything: a guess dressed as a measurement is worse than no answer.
 *
 * The median, not the mean, so one pathological run does not move it.
 */
export function typicalSeconds(jobs: Job[]): number | undefined {
  const measured = jobs
    .map((job) => job.execution_ms ?? 0)
    .filter((ms) => ms > 0)
    .sort((a, b) => a - b);
  if (measured.length < 3) return undefined;
  const middle = Math.floor(measured.length / 2);
  const median =
    measured.length % 2 === 0
      ? (measured[middle - 1] + measured[middle]) / 2
      : measured[middle];
  return Math.round(median / 1000);
}
