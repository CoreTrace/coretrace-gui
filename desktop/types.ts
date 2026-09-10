import type { components } from "./platform-schema";

export type Me = components["schemas"]["Me"];
export type Limits = components["schemas"]["Limits"];
export type Job = components["schemas"]["Job"];
export type Tool = components["schemas"]["Tool"];
export type Installation = components["schemas"]["ScmInstallation"];
export type Repository = components["schemas"]["ScmRepo"] & {
  installation: string;
};
export type Member = components["schemas"]["Member"];
export interface Workspace {
  id: string;
  name: string;
  path: string;
}
export interface FileEntry {
  name: string;
  path: string;
  directory: boolean;
}
export interface Document {
  content: string;
  revision: string;
}
/** A local run as the history keeps it: what ran, when, and its report. */
export interface LocalRun {
  id: string;
  startedAt: number;
  label: string;
  files: number;
  exitCode: number | null;
  cancelled: boolean;
  warnings: string[];
  report: string | null;
  /** Whether a report of this run was sent to the team. */
  reported: boolean;
}
export interface LocalResult {
  /** The history entry this result became; a report refers to it. */
  runId: string;
  warnings?: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  report: string | null;
  cancelled: boolean;
}
/** Whether a tool ctrace calls can be found on this machine. */
export interface ToolStatus {
  name: string;
  found: boolean;
}
/** What the desktop sends when a tool failed. */
export interface ReportBody {
  tools: string[];
  signature: string;
  ctrace_version: string;
  desktop_version: string;
  os: string;
  libraries: string;
  log: string;
  files: { name: string; content: string }[];
}
export interface DeviceCode {
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresIn: number;
}
export interface Finding {
  rule: string;
  level: string;
  path: string;
  line: number;
  message: string;
  tool?: string;
  /** Which machine ran the tool. Otherwise the two are indistinguishable. */
  origin?: "local" | "cloud";
}
export type Page =
  | "home"
  | "analyses"
  | "repositories"
  | "workspace"
  | "settings";

/** Where a cloud run has got to, as the Rust side reports it. */
export type CloudPhase =
  | { phase: "idle" }
  | { phase: "packing"; files: number; bytes: number }
  | { phase: "uploading"; files: number; total: number }
  | { phase: "verifying" }
  | { phase: "quoting" }
  | { phase: "quoted"; job: string; ctu: number; deadline: string }
  | { phase: "running"; job: string }
  | { phase: "done"; job: string }
  | { phase: "failed"; reason: string }
  | { phase: "cancelled"; spent: boolean };
