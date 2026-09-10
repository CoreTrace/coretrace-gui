import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Building2,
  Code2,
  FolderGit2,
  FolderOpen,
  FolderPlus,
  Home,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { desktop, errorMessage, native } from "./bridge";
import { Dialog, useConfirm } from "./components/Dialog";
import { launchAnalysis } from "./launch";
import { describe, running, useCloudRun } from "./useCloudRun";
import { Login } from "./components/Login";
import { Dashboard } from "./features/Dashboard";
import { Repositories } from "./features/Repositories";
import { Analyses } from "./features/Analyses";
import { Settings } from "./features/Settings";
import type { EditorHandle } from "./features/WorkspaceEditor";
import { useCloud } from "./useCloud";
import { typicalSeconds, workspaceRelativePath } from "./model";
import type {
  Job,
  LocalResult,
  LocalRun,
  Page,
  Repository,
  Workspace,
} from "./types";
const WorkspaceEditor = lazy(() =>
  import("./features/WorkspaceEditor").then((module) => ({
    default: module.WorkspaceEditor,
  })),
);

const pages = {
  home: "Accueil",
  analyses: "Analyses",
  repositories: "Dépôts",
  workspace: "Espace de code",
  settings: "Paramètres",
};
const navigation = [
  { id: "home", icon: Home },
  { id: "analyses", icon: Activity },
  { id: "repositories", icon: FolderGit2 },
  { id: "workspace", icon: Code2 },
] as const;
export default function App() {
  const cloud = useCloud();
  const [page, setPage] = useState<Page>("home");
  const [collapsed, setCollapsed] = useState(false);
  // Several folders can be open at once; `workspace` is the one being edited.
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  // Which files were open in each folder. A ref, not state: remembering must
  // not re-render the editor that is reporting it.
  const openTabs = useRef<Record<string, { paths: string[]; active: string }>>(
    {},
  );
  // The folder in front right now. A closure captures the folder as it was when
  // it started, and an analysis outlives that.
  const activeWorkspace = useRef<string | undefined>(undefined);
  // What the previous session had open. Choosing the executable and reopening
  // the same folders every time is work the reader already did once.
  useEffect(() => {
    if (!native) return;
    void desktop
      .restoreSession()
      .then((session) => {
        if (session.analyser) setAnalyser(session.analyser);
        if (session.workspaces.length) {
          setWorkspaces(session.workspaces);
          const first = session.workspaces[0];
          setWorkspace(first);
          activeWorkspace.current = first.id;
        }
      })
      .catch(() => {
        // A session that cannot be restored is a first run, not a failure.
      });
  }, []);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  // Nothing can spin when the system disallows animation, so the banner counts
  // real seconds instead: a number that changes is proof the work is alive.
  const [waited, setWaited] = useState(0);
  const [message, setMessage] = useState("");
  // A message is information; it leaves on its own unless the reader is
  // reading it. Decisions and offers are separate notices and stay.
  const [holdMessage, setHoldMessage] = useState(false);
  useEffect(() => {
    if (!message || holdMessage) return;
    const timer = setTimeout(() => setMessage(""), 8000);
    return () => clearTimeout(timer);
  }, [message, holdMessage]);
  const [login, setLogin] = useState(false);
  const [clone, setClone] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [draftRepo, setDraftRepo] = useState<Repository | null>(null);
  const [analyser, setAnalyser] = useState("");
  const [local, setLocal] = useState<LocalResult | null>(null);
  const [localRunning, setLocalRunning] = useState(false);
  // What ran on this machine in the open folder, newest first. Reloaded when
  // the folder changes and when a run finishes, which are the times it moves.
  const [localHistory, setLocalHistory] = useState<LocalRun[]>([]);
  // Runs reported this session, on top of what the history remembers.
  const [reportedNow, setReportedNow] = useState<Set<string>>(new Set());
  const reportedRuns = new Set([
    ...localHistory.filter((r) => r.reported).map((r) => r.id),
    ...reportedNow,
  ]);
  useEffect(() => {
    if (!native || !workspace) {
      setLocalHistory([]);
      return;
    }
    let live = true;
    void desktop
      .localHistory(workspace.id)
      .then((runs) => {
        if (live) setLocalHistory(runs);
      })
      .catch(() => {
        if (live) setLocalHistory([]);
      });
    return () => {
      live = false;
    };
  }, [workspace, localRunning]);
  useEffect(() => {
    if (!busy && !localRunning) {
      setWaited(0);
      return;
    }
    const started = Date.now();
    const tick = setInterval(
      () => setWaited(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(tick);
  }, [busy, localRunning]);
  // A cloud run started from the editor is still the reader's run when they
  // move to another tab, so it is owned here and reports itself in notices.
  const [finishedJob, setFinishedJob] = useState("");
  const cloudRun = useCloudRun({
    notify: setMessage,
    onFinished: (job) => {
      setFinishedJob(job);
      void cloud.refresh();
    },
  });
  const editor = useRef<EditorHandle>(null);
  const confirm = useConfirm();
  const orgRef = useRef(cloud.org);
  orgRef.current = cloud.org;
  useEffect(() => {
    setSelectedJob(null);
    setDraftRepo(null);
  }, [cloud.org]);
  // Native close requests also respect unsaved buffers; beforeunload alone is not sufficient in a WebView.
  useEffect(() => {
    if (!native) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/window")
      .then(async ({ getCurrentWindow }) => {
        const window = getCurrentWindow();
        const off = await window.onCloseRequested(async (event) => {
          if (!dirty && !localRunning) return;
          event.preventDefault();
          if (
            await confirm(
              "Fermer CoreTrace ?",
              `${dirty ? "Des modifications ne sont pas enregistrées. " : ""}${localRunning ? "Une analyse locale est en cours. " : ""}Voulez-vous quitter ?`,
              "Quitter",
            )
          ) {
            try {
              if (localRunning) await desktop.cancelLocal();
              await window.destroy();
            } catch (e) {
              setMessage(errorMessage(e));
            }
          }
        });
        if (disposed) off();
        else unlisten = off;
      })
      .catch((e) => setMessage(errorMessage(e)));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [dirty, localRunning, confirm]);
  const canSwitch = async () => {
    if (busy || localRunning) {
      setMessage(
        "Attendez la fin de l’opération en cours avant de changer de dossier.",
      );
      return false;
    }
    return (
      !dirty ||
      (await confirm(
        "Changer de dossier ?",
        "Les modifications non enregistrées des fichiers ouverts seront abandonnées.",
        "Changer de dossier",
      ))
    );
  };
  const activate = (next: Workspace | null) => {
    if (!next) return;
    setWorkspaces((open) =>
      open.some((w) => w.id === next.id) ? open : [...open, next],
    );
    setWorkspace(next);
    activeWorkspace.current = next.id;
    setDirty(false);
    setLocal(null);
    setPage("workspace");
  };
  /** Switches to a folder already open, guarding unsaved work as a change does. */
  const switchTo = async (id: string) => {
    const next = workspaces.find((w) => w.id === id);
    if (!next || next.id === workspace?.id) return;
    if (!(await canSwitch())) return;
    setWorkspace(next);
    activeWorkspace.current = next.id;
    setDirty(false);
  };
  const closeFolder = async (id: string) => {
    if (id === workspace?.id && !(await canSwitch())) return;
    try {
      const open = await desktop.closeWorkspace(id);
      delete openTabs.current[id];
      setWorkspaces(open);
      if (id === workspace?.id) {
        const next = open[open.length - 1] ?? null;
        setWorkspace(next);
        activeWorkspace.current = next?.id;
        setDirty(false);
        setLocal(null);
        if (open.length === 0) setPage("home");
      }
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };
  const openFolder = async () => {
    if (!(await canSwitch())) return;
    setBusy("Ouverture du dossier…");
    try {
      activate(await desktop.chooseWorkspace());
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy("");
    }
  };
  const cloneRepo = async () => {
    if (clone === null || !(await canSwitch())) return;
    setBusy("Clonage du dépôt GitHub…");
    try {
      const next = await desktop.cloneRepository(clone);
      activate(next);
      if (next) setClone(null);
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy("");
    }
  };
  const runLocal = async (path: string) => {
    if (!workspace || localRunning) return;
    if (!analyser) {
      setPage("settings");
      setMessage(
        "Sélectionnez le programme ctrace avant de lancer une analyse locale.",
      );
      return;
    }
    if (
      !(await confirm(
        "Analyser ce fichier local ?",
        `${path} sera analysé avec le programme ctrace sélectionné et ses outils installés.`,
        "Lancer ctrace",
      ))
    )
      return;
    setLocalRunning(true);
    setLocal(null);
    setPage("analyses");
    const ran = workspace.id;
    try {
      const result = await desktop.analyseLocal(ran, path);
      // An analysis takes seconds; the reader may have moved to another folder
      // since, and its result is not theirs.
      if (activeWorkspace.current === ran) setLocal(result);
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setLocalRunning(false);
    }
  };
  /** Analyses the whole open folder locally: what a cloud run does to a
      workspace, done on this machine when the cloud is not available. */
  const runLocalFolder = async () => {
    if (!workspace || localRunning) return;
    if (!analyser) {
      setPage("settings");
      setMessage(
        "Sélectionnez le programme ctrace avant de lancer une analyse locale.",
      );
      return;
    }
    setLocalRunning(true);
    setLocal(null);
    setPage("analyses");
    const ran = workspace.id;
    try {
      const result = await desktop.analyseLocalFolder(ran);
      if (activeWorkspace.current === ran) setLocal(result);
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setLocalRunning(false);
    }
  };
  // One entry point, owned here so the sidebar, the home page and the
  // analyses page all do the same thing when they say "Nouvelle analyse".
  const [starting, setStarting] = useState(false);
  const newAnalysis = async (askFirst = false) => {
    if (!workspace) {
      await openFolder();
      return;
    }
    // From the sidebar nothing on screen names the folder, so the button
    // would act on one the reader may not have in mind. Ask, naming it, and
    // offer the other thing "new" can mean.
    if (askFirst) {
      const answer = await confirm(
        `Analyser ${workspace.name} ?`,
        `Le dossier ouvert (${workspace.path}) sera analysé avec vos CTU si possible, sinon sur cette machine.`,
        `Analyser ${workspace.name}`,
        "Ouvrir un autre dossier",
      );
      if (answer === "alternative") {
        await openFolder();
        return;
      }
      if (!answer) return;
    }
    setStarting(true);
    try {
      await launchAnalysis({
        workspace: workspace.path,
        org: cloud.me ? cloud.org : "",
        startCloud: cloudRun.start,
        runLocal: runLocalFolder,
        notify: setMessage,
      });
    } finally {
      setStarting(false);
    }
  };
  const openFinding = (path: string, line: number) => {
    if (!workspace || !editor.current) {
      setMessage(
        "Ouvrez le dossier correspondant dans l’IDE pour accéder à ce fichier.",
      );
      return;
    }
    setPage("workspace");
    try {
      const relative = workspaceRelativePath(path, workspace.path);
      void editor.current
        .open(relative, line)
        .catch((e) => setMessage(errorMessage(e)));
    } catch (e) {
      setMessage(errorMessage(e));
    }
  };
  const selectJob = (job: Job | null) => {
    if (orgRef.current !== cloud.org) return;
    setSelectedJob(job);
    setPage("analyses");
  };
  const analyseRepo = (repo: Repository) => {
    setDraftRepo(repo);
    setSelectedJob(null);
    setPage("analyses");
  };
  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <ShieldCheck size={23} />
          </div>
          <span>
            CoreTrace<span className="brand-caption">DESKTOP</span>
          </span>
          <button
            className="icon collapse-button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Déployer le menu" : "Réduire le menu"}
          >
            {collapsed ? (
              <PanelLeftOpen size={16} />
            ) : (
              <PanelLeftClose size={16} />
            )}
          </button>
        </div>
        <button
          className="new-analysis"
          disabled={starting || localRunning || running(cloudRun.phase)}
          onClick={() => void newAnalysis(true)}
        >
          <Plus size={17} />
          <span>Nouvelle analyse</span>
        </button>
        <div className="nav-label">ESPACE DE TRAVAIL</div>
        <nav aria-label="Navigation principale">
          {navigation.map(({ id, icon: Icon }) => (
            <button
              key={id}
              title={pages[id]}
              className={page === id ? "active" : ""}
              aria-current={page === id ? "page" : undefined}
              onClick={() => setPage(id)}
            >
              <Icon size={18} />
              <span>{pages[id]}</span>
              {id === "analyses" && cloud.jobs.length > 0 && (
                <span className="nav-count">{cloud.jobs.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-label">COMPTE</div>
        <nav aria-label="Compte">
          <button
            title="Paramètres"
            className={page === "settings" ? "active" : ""}
            onClick={() => setPage("settings")}
          >
            <Settings2 size={18} />
            <span>Paramètres</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          {/* The organisation already has a picker in the header and the
              account its own button below; repeating the slug here said
              nothing the reader could act on. */}
          <button
            className="profile"
            onClick={() => (cloud.me ? setPage("settings") : setLogin(true))}
          >
            <span className="avatar">
              {/* The platform names API keys only, so a signed-in human has no
                  principal name; the e-mail is the identity to show. */}
              {(cloud.me?.principal.name ?? cloud.me?.email)
                ?.slice(0, 2)
                .toUpperCase() || "CT"}
            </span>
            <span>
              <strong>
                {cloud.me
                  ? (cloud.me.principal.name ??
                    cloud.me.email ??
                    "Compte connecté")
                  : "Se connecter"}
              </strong>
              <small>
                {cloud.me
                  ? cloud.org || "Aucune organisation"
                  : "Accéder à CoreTrace Cloud"}
              </small>
            </span>
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            {page === "workspace" && workspace && (
              <>
                {/* Several folders can be open; this is the one being edited. */}
                <select
                  aria-label="Dossier actif"
                  className="folder-picker"
                  value={workspace.id}
                  onChange={(e) => void switchTo(e.target.value)}
                >
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <button
                  className="text-button"
                  title="Ouvrir un autre dossier dans cet espace de travail"
                  onClick={() => void openFolder()}
                >
                  <FolderPlus size={15} />
                </button>
                {workspaces.length > 1 && (
                  <button
                    className="text-button"
                    title={`Fermer ${workspace.name}`}
                    onClick={() => void closeFolder(workspace.id)}
                  >
                    <X size={15} />
                  </button>
                )}
              </>
            )}
          </div>
          <div className="inline">
            {cloud.me && (
              <label className="org-picker">
                <Building2 size={14} />
                <select
                  aria-label="Organisation active"
                  value={cloud.org}
                  onChange={(e) => {
                    setSelectedJob(null);
                    setDraftRepo(null);
                    cloud.setOrg(e.target.value);
                  }}
                >
                  {cloud.me.orgs.map((org) => (
                    <option key={org.id} value={org.slug}>
                      {org.slug}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              className="icon"
              disabled={cloud.loading}
              onClick={() => void cloud.refresh()}
              aria-label="Actualiser les données"
            >
              <RefreshCw size={16} className={cloud.loading ? "spin" : ""} />
            </button>
            <button
              className="text-button web-link"
              onClick={() =>
                void desktop
                  .openAccount("dashboard")
                  .catch((e) => setMessage(errorMessage(e)))
              }
            >
              Ouvrir sur le web <ArrowUpRight size={14} />
            </button>
          </div>
        </header>
        {!native && (
          <div className="preview-notice">
            Aperçu navigateur · Ouvrez l’application desktop pour accéder aux
            dossiers, à GitHub et à votre compte.
          </div>
        )}
        {cloud.error && (
          <div className="global-error" role="alert">
            {cloud.error}
            <button onClick={() => void cloud.refresh()}>Réessayer</button>
          </div>
        )}
        <main
          className={
            page === "workspace"
              ? "main-content workspace-content"
              : "main-content"
          }
        >
          {page === "home" && (
            <Dashboard
              cloud={cloud}
              workspace={workspace}
              navigate={setPage}
              openFolder={() => void openFolder()}
              clone={() => setClone("")}
              analyse={() => void newAnalysis()}
              login={() => setLogin(true)}
              selectJob={selectJob}
            />
          )}
          {page === "repositories" && (
            <Repositories
              cloud={cloud}
              clone={(name) => setClone(name ?? "")}
              analyse={analyseRepo}
              notify={setMessage}
            />
          )}
          <div hidden={page !== "analyses"}>
            <Analyses
              key={cloud.org}
              cloud={cloud}
              selected={selectedJob}
              select={selectJob}
              initialRepository={draftRepo}
              initialRef=""
              clearDraft={() => {
                if (orgRef.current === cloud.org) setDraftRepo(null);
              }}
              notify={setMessage}
              openFinding={openFinding}
              local={local}
              localRunning={localRunning}
              workspaceRoot={workspace?.path}
              newAnalysis={() => void newAnalysis()}
              workspaceName={workspace?.name}
              cloudRun={cloudRun}
              localHistory={localHistory}
              workspaceId={workspace?.id}
              reportedRuns={reportedRuns}
              markReported={(id) =>
                setReportedNow((old) => new Set([...old, id]))
              }
              login={() => setLogin(true)}
              showLocalRun={(run) =>
                // The output was not kept; the report and its verdict were.
                setLocal({
                  runId: run.id,
                  exitCode: run.exitCode,
                  stdout: "",
                  stderr: "",
                  report: run.report,
                  cancelled: run.cancelled,
                  warnings: run.warnings,
                })
              }
              openWorkspace={() =>
                workspace ? setPage("workspace") : void openFolder()
              }
            />
          </div>
          {page === "settings" && (
            <Settings
              cloud={cloud}
              analyser={analyser}
              setAnalyser={setAnalyser}
              login={() => setLogin(true)}
              notify={setMessage}
            />
          )}
          <div className="workspace-host" hidden={page !== "workspace"}>
            {workspace ? (
              <Suspense
                fallback={<div className="empty">Chargement de l’éditeur…</div>}
              >
                <WorkspaceEditor
                  key={workspace.id}
                  ref={editor}
                  workspace={workspace}
                  workspaces={workspaces}
                  openIn={(id, path) => {
                    // Opening a file from another folder brings that folder to
                    // the front with the file already open, which is what
                    // clicking it means.
                    const remembered = openTabs.current[id];
                    const paths = remembered?.paths.includes(path)
                      ? remembered.paths
                      : [...(remembered?.paths ?? []), path];
                    openTabs.current[id] = { paths, active: path };
                    void switchTo(id);
                  }}
                  restore={openTabs.current[workspace.id]}
                  tabsChanged={(paths, active) => {
                    openTabs.current[workspace.id] = { paths, active };
                  }}
                  dirtyChanged={setDirty}
                  run={(path) => void runLocal(path)}
                  runInCloud={
                    cloud.org && workspace
                      ? () => void cloudRun.start(workspace.path, cloud.org)
                      : undefined
                  }
                  busy={localRunning || running(cloudRun.phase)}
                  notify={setMessage}
                />
              </Suspense>
            ) : (
              <div className="empty centered">
                <Code2 size={45} />
                <h1>Un espace pour votre code.</h1>
                <p>
                  Ouvrez un dossier local ou clonez un dépôt GitHub pour
                  commencer.
                </p>
                <div className="inline">
                  <button className="primary" onClick={() => void openFolder()}>
                    <FolderOpen size={16} />
                    Ouvrir un dossier
                  </button>
                  <button onClick={() => setClone("")}>
                    <FolderGit2 size={16} />
                    Cloner depuis GitHub
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
        {/* The status bar is the one place a run reports itself. From any
            page, a glance at the bottom edge says what is happening, for how
            long, and how to stop it. */}
        <footer className="app-status" role="status">
          <span className="grow">
            {running(cloudRun.phase) ? (
              <>
                <LoaderCircle className="spin" size={13} />
                {describe(
                  cloudRun.phase,
                  cloudRun.seconds,
                  typicalSeconds(cloud.jobs),
                )}
                <button
                  className="text-button"
                  disabled={cloudRun.busy}
                  onClick={() => void cloudRun.cancel(cloud.org)}
                >
                  Annuler
                </button>
              </>
            ) : localRunning ? (
              <>
                <LoaderCircle className="spin" size={13} />
                Analyse locale en cours · {waited} s
                <button
                  className="text-button"
                  onClick={() =>
                    void desktop
                      .cancelLocal()
                      .catch((e) => setMessage(errorMessage(e)))
                  }
                >
                  Arrêter
                </button>
              </>
            ) : busy ? (
              <>
                <LoaderCircle className="spin" size={13} />
                {busy}
                {waited > 0 && ` · ${waited} s`}
              </>
            ) : !native ? (
              "Aperçu de l’interface"
            ) : null}
          </span>
          <span>{workspace ? workspace.name : "Aucun dossier ouvert"}</span>
        </footer>
      </div>
      {/* A quote is a decision, not news: nothing is spent until it is taken,
          so it is offered wherever the reader happens to be. */}
      {cloudRun.phase.phase === "quoted" && (
        <div className="toast decision" role="alert">
          <span>
            <strong>
              {cloudRun.phase.ctu.toLocaleString("fr-FR")} CTU seront débités
            </strong>
            <small>Rien n’a encore été débité pour cette analyse.</small>
          </span>
          <button
            className="primary"
            disabled={cloudRun.busy}
            onClick={() => void cloudRun.approve(cloud.org)}
          >
            Lancer l’analyse
          </button>
          <button disabled={cloudRun.busy} onClick={() => void cloudRun.cancel(cloud.org)}>
            Refuser
          </button>
        </div>
      )}
      {finishedJob && (
        <div className="toast decision" role="status">
          <span>
            <strong>Analyse terminée</strong>
            <small>Ses résultats sont prêts.</small>
          </span>
          <button
            className="primary"
            onClick={() => {
              const job = finishedJob;
              setFinishedJob("");
              void (async () => {
                try {
                  selectJob(await desktop.readCloud<Job>("job", cloud.org, job));
                } catch (e) {
                  setMessage(errorMessage(e));
                }
              })();
            }}
          >
            Voir les résultats
          </button>
          <button
            className="icon"
            aria-label="Fermer la notification"
            onClick={() => setFinishedJob("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {message && (
        <div
          className="toast"
          role="status"
          onMouseEnter={() => setHoldMessage(true)}
          onMouseLeave={() => setHoldMessage(false)}
        >
          <span>{message}</span>
          <button
            className="icon"
            aria-label="Fermer le message"
            onClick={() => setMessage("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {login && (
        <Login close={() => setLogin(false)} connected={cloud.reconnect} />
      )}
      {clone !== null && (
        <Dialog
          title="Cloner un dépôt GitHub"
          close={() => {
            if (!busy) setClone(null);
          }}
        >
          <p>
            Choisissez un dépôt connecté ou saisissez <code>propriétaire/dépôt</code>.
            CoreTrace le clone et le range avec les autres ; le dossier est
            indiqué dans les paramètres.
          </p>
          <label>
            Dépôt GitHub
            <input
              autoFocus
              list="connected-repositories"
              value={clone}
              placeholder="CoreTrace/coretrace-gui"
              disabled={!!busy}
              onChange={(e) => setClone(e.target.value)}
            />
            {/* The field looked like a search that did nothing. The repositories
                already connected are the ones most likely wanted, so it suggests
                them while still accepting any owner/repository. */}
            <datalist id="connected-repositories">
              {cloud.repositories.map((r) => (
                <option key={r.id} value={r.full_name} />
              ))}
            </datalist>
          </label>
          {busy ? (
            <p role="status" className="operation">
              <LoaderCircle className="spin" size={16} />
              {busy}
              {waited > 0 && <span className="muted"> · {waited} s</span>}
            </p>
          ) : (
            <p className="muted small">
              Les dépôts privés utilisent votre connexion Git locale. Si
              nécessaire, connectez Git Credential Manager ou exécutez gh auth
              setup-git.
            </p>
          )}
          <footer>
            <button disabled={!!busy} onClick={() => setClone(null)}>
              Annuler
            </button>
            <button
              className="primary"
              disabled={!clone.trim() || !!busy}
              onClick={() => void cloneRepo()}
            >
              {busy ? "Clonage…" : "Cloner"}
            </button>
          </footer>
        </Dialog>
      )}
    </div>
  );
}
