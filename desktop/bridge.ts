import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  CloudPhase,
  DeviceCode,
  Document,
  FileEntry,
  Job,
  LocalResult,
  LocalRun,
  Workspace,
} from "./types";

export const native = isTauri();
export interface AnalysisOptions {
  config: string | null;
  compileCommands: string | null;
}
function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!native)
    return Promise.reject(
      new Error(
        "Cette action nécessite l’application desktop. Lancez npm start.",
      ),
    );
  return invoke<T>(command, args);
}
export const desktop = {
  chooseWorkspace: () => call<Workspace | null>("choose_workspace"),
  /** Starts a cloud run on the open folder; it stops at the quote. */
  startCloudRun: (root: string, org: string, tools: string[] = []) =>
    call<void>("cloud_run_start", { root, org, tools }),
  cloudRunStatus: () => call<CloudPhase>("cloud_run_status"),
  /** Approves the quote. This is the call that spends CTU. */
  confirmCloudRun: (org: string) => call<void>("cloud_run_confirm", { org }),
  cancelCloudRun: () => call<void>("cloud_run_cancel"),
  /** The folders and ctrace executable the previous session left behind. */
  restoreSession: () =>
    call<{ workspaces: Workspace[]; analyser: string | null }>(
      "restore_session",
    ),
  /** Every folder open now, in the order they were opened. */
  workspaces: () => call<Workspace[]>("workspaces"),
  /** Closes one folder; the files on disk are untouched. */
  closeWorkspace: (id: string) => call<Workspace[]>("close_workspace", { id }),
  /** Where clones are kept, for Settings to show. */
  cloneLocation: () => call<string>("clone_location"),
  cloneRepository: (repository: string) =>
    call<Workspace | null>("clone_repository", { repository }),
  files: (workspaceId: string, path = "") =>
    call<FileEntry[]>("list_files", { workspaceId, path }),
  read: (workspaceId: string, path: string) =>
    call<Document>("read_file", { workspaceId, path }),
  save: (
    workspaceId: string,
    path: string,
    content: string,
    revision: string,
  ) => call<Document>("save_file", { workspaceId, path, content, revision }),
  chooseAnalyser: () => call<string | null>("choose_analyser"),
  analysisOptions: () => call<AnalysisOptions>("analysis_options"),
  chooseAnalysisFile: (kind: keyof AnalysisOptions, clear = false) =>
    call<AnalysisOptions>("choose_analysis_file", { kind, clear }),
  /** Recent local runs of the open folder, newest first. */
  localHistory: (workspaceId: string) =>
    call<LocalRun[]>("local_history", { workspaceId }),
  /** Analyses every source file in the open folder, one after another. */
  analyseLocalFolder: (workspaceId: string) =>
    call<LocalResult>("analyse_local_folder", { workspaceId }),
  analyseLocal: (workspaceId: string, path: string) =>
    call<LocalResult>("analyse_local", { workspaceId, path }),
  cancelLocal: () => call<void>("cancel_local"),
  status: () =>
    native
      ? call<{ signedIn: boolean; baseUrl: string }>("cloud_status")
      : Promise.resolve({
          signedIn: false,
          baseUrl: "https://api.coretrace.fr/v1",
        }),
  login: () => call<DeviceCode>("login_start"),
  pollLogin: () => call<boolean>("login_poll"),
  cancelLogin: () => call<void>("login_cancel"),
  logout: () => call<void>("logout"),
  readCloud: <T>(resource: string, org?: string, id?: string, run?: string) =>
    call<T>("cloud_read", { resource, org, id, run }),
  analyseCloud: (
    org: string,
    installation: string,
    repository: string,
    reference: string,
    rerun: boolean,
    requestId: string,
  ) =>
    call<Job>("cloud_analyse", {
      org,
      installation,
      repository,
      reference,
      rerun,
      requestId,
    }),
  cancelCloud: (org: string, id: string) =>
    call<void>("cloud_cancel", { org, id }),
  report: (org: string, id: string, run: string) =>
    call<string>("cloud_report", { org, id, run }),
  /** Opens GitHub's authorisation in the system browser; resolves with the URL. */
  connectGitHub: () => call<string>("connect_github"),
  openAccount: (page: "device" | "dashboard" | "repositories" | "settings") =>
    call<void>("open_account", { page }),
};
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
