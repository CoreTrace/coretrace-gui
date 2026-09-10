/**
 * One way to start an analysis, from anywhere.
 *
 * The platform analyses the open folder with the reader's CTU when there is
 * an organisation to spend them from; otherwise, and whenever the platform
 * will not take the run, the same folder is analysed on this machine. The
 * reader asked for the folder to be analysed, not for a particular place to
 * do it.
 */
export async function launchAnalysis({
  workspace,
  org,
  startCloud,
  runLocal,
  notify,
}: {
  workspace: string;
  /** The organisation to bill, or empty when signed out or without one. */
  org: string;
  /** Resolves to whether the platform accepted the run. */
  startCloud: (workspace: string, org: string) => Promise<boolean>;
  runLocal: () => Promise<void>;
  notify: (message: string) => void;
}): Promise<"cloud" | "local"> {
  if (org) {
    if (await startCloud(workspace, org)) return "cloud";
    notify("Analyse cloud impossible. Analyse sur cette machine à la place.");
  }
  await runLocal();
  return "local";
}
