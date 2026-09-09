import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Building2,
  Code2,
  FolderGit2,
  FolderOpen,
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
import { Login } from "./components/Login";
import { Dashboard } from "./features/Dashboard";
import { Repositories } from "./features/Repositories";
import { Analyses } from "./features/Analyses";
import { Settings } from "./features/Settings";
import type { EditorHandle } from "./features/WorkspaceEditor";
import { useCloud } from "./useCloud";
import { workspaceRelativePath } from "./model";
import type { Job, LocalResult, Page, Repository, Workspace } from "./types";
const WorkspaceEditor = lazy(() =>
  import("./features/WorkspaceEditor").then((module) => ({
    default: module.WorkspaceEditor,
  })),
);

const pages = {
  home: "Accueil",
  organisation: "Organisation",
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
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [login, setLogin] = useState(false);
  const [clone, setClone] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [draftRepo, setDraftRepo] = useState<Repository | null>(null);
  const [analyser, setAnalyser] = useState("");
  const [local, setLocal] = useState<LocalResult | null>(null);
  const [localRunning, setLocalRunning] = useState(false);
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
    setWorkspace(next);
    setDirty(false);
    setLocal(null);
    setPage("workspace");
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
    try {
      setLocal(await desktop.analyseLocal(workspace.id, path));
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setLocalRunning(false);
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
          onClick={() => {
            setSelectedJob(null);
            setPage("analyses");
          }}
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
            title="Organisation"
            className={page === "organisation" ? "active" : ""}
            onClick={() => setPage("organisation")}
          >
            <Building2 size={18} />
            <span>Organisation</span>
          </button>
          <button
            title="Paramètres"
            className={page === "settings" ? "active" : ""}
            onClick={() => setPage("settings")}
          >
            <Settings2 size={18} />
            <span>Paramètres</span>
          </button>
        </nav>
        {workspace && (
          <div className="sidebar-workspace">
            <div className="nav-label">DOSSIER OUVERT</div>
            <button title={workspace.path} onClick={() => setPage("workspace")}>
              <FolderOpen size={15} />
              <span>{workspace.name}</span>
              {dirty && <span className="dirty-dot" />}
            </button>
          </div>
        )}
        <div className="sidebar-bottom">
          <div className="cloud-card">
            <span className="inline">
              <span className={`status-dot ${cloud.me ? "" : "offline"}`} />
              {cloud.me ? "CoreTrace Cloud" : "Mode local"}
            </span>
            <p>
              {cloud.me
                ? cloud.org || "Aucune organisation"
                : "Votre code reste à portée de main."}
            </p>
          </div>
          <button
            className="profile"
            onClick={() => (cloud.me ? setPage("settings") : setLogin(true))}
          >
            <span className="avatar">
              {cloud.me?.principal.name?.slice(0, 2).toUpperCase() || "CT"}
            </span>
            <span>
              <strong>{cloud.me?.principal.name || "Se connecter"}</strong>
              <small>
                {cloud.me ? "Compte personnel" : "Accéder à CoreTrace Cloud"}
              </small>
            </span>
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            CoreTrace <span>/</span>
            <strong>{pages[page]}</strong>
            {page === "workspace" && workspace && (
              <>
                <span>/</span>
                {workspace.name}
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
        {busy && (
          <div className="operation" role="status">
            <LoaderCircle className="spin" size={16} />
            {busy}
          </div>
        )}
        <main
          className={
            page === "workspace"
              ? "main-content workspace-content"
              : "main-content"
          }
        >
          {(page === "home" || page === "organisation") && (
            <Dashboard
              cloud={cloud}
              organisation={page === "organisation"}
              workspace={workspace}
              navigate={setPage}
              openFolder={() => void openFolder()}
              clone={() => setClone("")}
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
                  dirtyChanged={setDirty}
                  run={(path) => void runLocal(path)}
                  runInCloud={
                    cloud.org
                      ? () => {
                          // The panel that drives a cloud run lives with the
                          // analyses; sending the reader there is what starting
                          // one from the editor means.
                          setPage("analyses");
                        }
                      : undefined
                  }
                  busy={localRunning}
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
        <footer className="app-status">
          <span>
            <span className="status-dot" />
            {native ? "Desktop prêt" : "Aperçu de l’interface"}
          </span>
          <span>
            {localRunning
              ? "Analyse locale en cours"
              : workspace
                ? workspace.name
                : "Aucun dossier ouvert"}
          </span>
        </footer>
      </div>
      {message && (
        <div className="toast" role="alert">
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
          <p className="muted small">
            Les dépôts privés utilisent votre connexion Git locale. Si
            nécessaire, connectez Git Credential Manager ou exécutez gh auth
            setup-git.
          </p>
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
