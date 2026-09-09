import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/basic-languages/monaco.contribution";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import {
  ChevronDown,
  ChevronRight,
  CloudUpload,
  FileCode2,
  Folder,
  FolderOpen,
  Play,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import { desktop, errorMessage } from "../bridge";
import { useConfirm } from "../components/Dialog";
import type { Document, FileEntry, Workspace } from "../types";

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });
interface Tab extends Document {
  path: string;
  draft: string;
}
export interface EditorHandle {
  open: (path: string, line?: number) => Promise<void>;
}
interface Props {
  workspace: Workspace;
  dirtyChanged: (dirty: boolean) => void;
  run: (path: string) => void;
  /** Sends the whole workspace to the platform; absent when signed out. */
  runInCloud?: () => void;
  /** Every folder open now, so the explorer shows them all at once. */
  workspaces?: Workspace[];
  /** Opens a file living in another open folder. */
  openIn?: (workspace: string, path: string) => void;
  /** Files that were open in this folder last time, and which was in front. */
  restore?: { paths: string[]; active: string };
  /** Reports which files are open, so returning to this folder finds them. */
  tabsChanged?: (paths: string[], active: string) => void;
  busy: boolean;
  notify: (message: string) => void;
}
const language = (path: string) =>
  ({
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rs: "rust",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    hpp: "cpp",
    go: "go",
    java: "java",
    json: "json",
    md: "markdown",
    html: "html",
    css: "css",
    yaml: "yaml",
    yml: "yaml",
    sh: "shell",
    toml: "ini",
  })[path.split(".").pop() ?? ""] ?? "plaintext";

function Tree({
  workspace,
  path = "",
  depth = 0,
  select,
  selected,
  refresh,
}: {
  workspace: Workspace;
  path?: string;
  depth?: number;
  select: (path: string) => void;
  selected: string;
  refresh: number;
}) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setError("");
    void desktop
      .files(workspace.id, path)
      .then((files) => {
        if (active) setEntries(files);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [workspace.id, path, refresh]);
  return (
    <div role="group">
      {error && <p className="error small">{error}</p>}
      {entries.map((entry) => (
        <div key={entry.path}>
          <button
            className={`tree-row ${selected === entry.path ? "selected" : ""}`}
            style={{ paddingLeft: 12 + depth * 14 }}
            aria-expanded={
              entry.directory ? expanded.has(entry.path) : undefined
            }
            onClick={() => {
              if (!entry.directory) {
                select(entry.path);
                return;
              }
              setExpanded((old) => {
                const next = new Set(old);
                if (next.has(entry.path)) next.delete(entry.path);
                else next.add(entry.path);
                return next;
              });
            }}
          >
            {entry.directory ? (
              <>
                {expanded.has(entry.path) ? (
                  <ChevronDown size={12} />
                ) : (
                  <ChevronRight size={12} />
                )}
                <Folder size={14} />
              </>
            ) : (
              <>
                <span className="tree-indent" />
                <FileCode2 size={14} />
              </>
            )}
            <span>{entry.name}</span>
          </button>
          {entry.directory && expanded.has(entry.path) && (
            <Tree
              workspace={workspace}
              path={entry.path}
              depth={depth + 1}
              select={select}
              selected={selected}
              refresh={refresh}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export const WorkspaceEditor = forwardRef<EditorHandle, Props>(
  function WorkspaceEditor(
    {
      workspace,
      workspaces,
      openIn,
      dirtyChanged,
      run,
      runInCloud,
      busy,
      notify,
      restore,
      tabsChanged,
    },
    ref,
  ) {
    const [tabs, setTabs] = useState<Tab[]>([]);
    const [active, setActive] = useState("");
    const [refresh, setRefresh] = useState(0);
    const [saving, setSaving] = useState(false);
    const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const pendingLine = useRef<number | null>(null);
    const confirm = useConfirm();
    const tab = tabs.find((t) => t.path === active);
    const dirty = tabs.some((t) => t.content !== t.draft);
    const alive = useRef(true);
    useEffect(() => {
      alive.current = true;
      return () => {
        alive.current = false;
      };
    }, []);
    useEffect(() => {
      dirtyChanged(dirty);
    }, [dirty, dirtyChanged]);
    // Which files are open, not what is in them: switching folders discards
    // unsaved work by design, so drafts are never resurrected.
    useEffect(() => {
      tabsChanged?.(
        tabs.map((t) => t.path),
        active,
      );
    }, [tabs, active, tabsChanged]);
    useEffect(() => {
      const prevent = (event: BeforeUnloadEvent) => {
        if (dirty) {
          event.preventDefault();
          event.returnValue = "";
        }
      };
      window.addEventListener("beforeunload", prevent);
      return () => window.removeEventListener("beforeunload", prevent);
    }, [dirty]);
    const reveal = (line: number) => {
      editor.current?.revealLineInCenter(line);
      editor.current?.setPosition({ lineNumber: line, column: 1 });
      editor.current?.focus();
    };
    const open = async (path: string, line?: number) => {
      // Native resolution is authoritative; never accept a report's absolute URI as a workspace path.
      if (!tabs.some((t) => t.path === path)) {
        const doc = await desktop.read(workspace.id, path);
        if (!alive.current) return;
        setTabs((previous) =>
          previous.some((t) => t.path === path)
            ? previous
            : [...previous, { ...doc, path, draft: doc.content }],
        );
      }
      setActive(path);
      if (line) {
        pendingLine.current = line;
        if (active === path) reveal(line);
      }
    };
    useImperativeHandle(ref, () => ({ open }));
    // Reopen what was open in this folder. The content comes from disk, so a
    // file changed elsewhere since is the file that appears.
    const restored = useRef(false);
    useEffect(() => {
      if (restored.current || !restore?.paths.length) return;
      restored.current = true;
      void (async () => {
        for (const path of restore.paths) {
          try {
            await open(path);
          } catch {
            // A file deleted or renamed since simply does not come back.
          }
        }
        if (restore.active) setActive(restore.active);
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restore]);
    useEffect(() => {
      if (pendingLine.current) {
        const line = pendingLine.current;
        pendingLine.current = null;
        requestAnimationFrame(() => reveal(line));
      }
    }, [active]);
    const save = async () => {
      if (!tab || saving) return;
      setSaving(true);
      try {
        const result = await desktop.save(
          workspace.id,
          tab.path,
          tab.draft,
          tab.revision,
        );
        if (alive.current)
          setTabs((previous) =>
            previous.map((t) =>
              t.path === tab.path
                ? { ...t, content: result.content, revision: result.revision }
                : t,
            ),
          );
      } catch (e) {
        notify(errorMessage(e));
      } finally {
        if (alive.current) setSaving(false);
      }
    };
    const saveRef = useRef(save);
    saveRef.current = save;
    const mounted: OnMount = (instance) => {
      editor.current = instance;
      instance.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => void saveRef.current(),
      );
      if (pendingLine.current) {
        reveal(pendingLine.current);
        pendingLine.current = null;
      }
    };
    const close = async (path: string) => {
      const closing = tabs.find((t) => t.path === path)!;
      if (
        closing.content !== closing.draft &&
        !(await confirm(
          "Abandonner les modifications ?",
          `${path} contient des modifications non enregistrées.`,
          "Abandonner",
        ))
      )
        return;
      setTabs((previous) => previous.filter((t) => t.path !== path));
      if (active === path)
        setActive(tabs.find((t) => t.path !== path)?.path ?? "");
    };
    return (
      <div className="ide">
        <aside className="file-explorer">
          {/* Every open folder, not only the one being edited: closing the
              others out of sight was the part that felt unlike an editor. */}
          {(workspaces?.length ? workspaces : [workspace]).map((w) => (
            <section key={w.id} className="explorer-root">
              <div className="explorer-heading">
                <span className={w.id === workspace.id ? "current" : undefined}>
                  <FolderOpen size={14} /> {w.name}
                </span>
                {w.id === workspace.id && (
                  <button
                    className="icon"
                    aria-label="Actualiser les fichiers"
                    onClick={() => setRefresh((n) => n + 1)}
                  >
                    <RefreshCw size={14} />
                  </button>
                )}
              </div>
              <Tree
                workspace={w}
                select={(path) => {
                  if (w.id === workspace.id) {
                    void open(path).catch((e) => notify(errorMessage(e)));
                  } else {
                    openIn?.(w.id, path);
                  }
                }}
                selected={w.id === workspace.id ? active : ""}
                refresh={refresh}
              />
            </section>
          ))}
        </aside>
        <section className="editor-area">
          <div
            className="editor-tabs"
            role="tablist"
            aria-label="Fichiers ouverts"
          >
            {tabs.map((t) => (
              <div
                className={`editor-tab ${t.path === active ? "active" : ""}`}
                key={t.path}
              >
                <button
                  role="tab"
                  aria-selected={t.path === active}
                  title={t.path}
                  onClick={() => setActive(t.path)}
                >
                  <FileCode2 size={14} />
                  {t.path.split("/").pop()}
                  {t.content !== t.draft && (
                    <span className="dirty-dot" aria-label="Modifié" />
                  )}
                </button>
                <button
                  className="icon"
                  aria-label={`Fermer ${t.path}`}
                  onClick={() => void close(t.path)}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          {tab ? (
            <>
              <div className="editor-toolbar">
                <span title={tab.path}>{tab.path}</span>
                <div className="inline">
                  <button
                    disabled={saving || tab.content === tab.draft}
                    onClick={() => void save()}
                  >
                    <Save size={14} />
                    {saving ? "Enregistrement…" : "Enregistrer"}
                  </button>
                  <button
                    className="primary"
                    disabled={busy || dirty}
                    title={
                      dirty
                        ? "Enregistrez les fichiers avant de lancer une analyse"
                        : "Analyse statique du fichier actif avec ctrace"
                    }
                    onClick={() => run(tab.path)}
                  >
                    <Play size={14} />
                    Analyser le fichier
                  </button>
                  {runInCloud && (
                    <button
                      disabled={busy}
                      title="Envoie le dossier ouvert à la plateforme et l’analyse avec vos CTU"
                      onClick={runInCloud}
                    >
                      <CloudUpload size={14} />
                      Analyser dans le cloud
                    </button>
                  )}
                </div>
              </div>
              <Editor
                path={`${workspace.id}/${tab.path}`}
                language={language(tab.path)}
                value={tab.draft}
                theme="vs-dark"
                onMount={mounted}
                onChange={(value) =>
                  setTabs((previous) =>
                    previous.map((t) =>
                      t.path === active ? { ...t, draft: value ?? "" } : t,
                    ),
                  )
                }
                options={{
                  automaticLayout: true,
                  fontSize: 13,
                  fontFamily: "'Cascadia Code', 'Consolas', monospace",
                  minimap: { enabled: false },
                  padding: { top: 18 },
                  scrollBeyondLastLine: false,
                  smoothScrolling: true,
                }}
              />
              <div className="editor-status">
                <span>{language(tab.path)} · UTF-8</span>
                <span>
                  Ctrl/Cmd + S : enregistrer · Ctrl/Cmd + F : rechercher
                </span>
              </div>
            </>
          ) : (
            <div className="empty centered">
              <FileCode2 size={36} />
              <h2>Votre code, au même endroit.</h2>
              <p>
                Sélectionnez un fichier pour le lire, le modifier ou l’analyser.
              </p>
              <span className="small muted">{workspace.path}</span>
            </div>
          )}
        </section>
      </div>
    );
  },
);
