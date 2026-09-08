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
export interface LocalResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  report: string | null;
  cancelled: boolean;
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
}
export type Page =
  | "home"
  | "organisation"
  | "analyses"
  | "repositories"
  | "workspace"
  | "settings";
