import type { Finding, Job, Limits } from "./types";

export const terminal = (job: Job) =>
  ["completed", "cancelled", "rejected"].includes(job.status);
export const billed = (job: Job) =>
  job.runs.reduce((sum, run) => sum + run.billed_ctu, 0);
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
export function parseFindings(text: string, tool?: string): Finding[] {
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
    };
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text.split("\n").flatMap((line) => {
      try {
        const f = finding(JSON.parse(line));
        return f ? [f] : [];
      } catch {
        return [];
      }
    });
  }
  if (!record(parsed)) return [];
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
  return single ? [single] : [];
}
