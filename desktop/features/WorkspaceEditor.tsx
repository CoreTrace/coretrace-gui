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
  Search,
  X,
} from "lucide-react";
import { desktop, errorMessage } from "../bridge";
import { Dialog, useConfirm } from "../components/Dialog";
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
    // Folders the reader has collapsed. With several open, a long tree pushes
    // the others off the screen.
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [saving, setSaving] = useState(false);
    // The analyse menu, closed on every choice so it never covers the editor.
    const [menuOpen, setMenuOpen] = useState(false);
    // Finding a file by name. The listing is fetched the first time it is
    // asked for and kept for the life of this folder.
    const [quickOpen, setQuickOpen] = useState(false);
    const [allFiles, setAllFiles] = useState<string[] | null>(null);
    const [query, setQuery] = useState("");
    const [cursor, setCursor] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
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
    const openQuick = () => {
      setQuery("");
      setCursor(0);
      setQuickOpen(true);
      if (allFiles === null) {
        void desktop
          .allFiles(workspace.id)
          .then((files) => {
            if (alive.current) setAllFiles(files);
          })
          .catch((e) => notify(errorMessage(e)));
      }
    };
    const openQuickRef = useRef(openQuick);
    openQuickRef.current = openQuick;
    useEffect(() => {
      const onKey = (event: KeyboardEvent) => {
        if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "p")
          return;
        // The editor stays mounted behind other pages; only answer when it is
        // the page in front.
        if (rootRef.current?.closest("[hidden]")) return;
        event.preventDefault();
        openQuickRef.current();
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, []);
    const matches = (() => {
      if (!allFiles) return [];
      const needle = query.trim().toLowerCase();
      if (!needle) return allFiles.slice(0, 50);
      // A name that starts with the query beats one that merely contains it,
      // which beats a match only in the folder path.
      const score = (path: string) => {
        const name = path.split("/").pop()?.toLowerCase() ?? "";
        if (name.startsWith(needle)) return 0;
        if (name.includes(needle)) return 1;
        if (path.toLowerCase().includes(needle)) return 2;
        return -1;
      };
      return allFiles
        .map((path) => [score(path), path] as const)
        .filter(([rank]) => rank >= 0)
        .sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]))
        .slice(0, 50)
        .map(([, path]) => path);
    })();
    const chooseQuick = (path: string) => {
      setQuickOpen(false);
      void open(path).catch((e) => notify(errorMessage(e)));
    };
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
      instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, () =>
        openQuickRef.current(),
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
    // Analysing reads the files on disk, so unsaved work would be analysed as
    // it was. Rather than refuse until the reader saves, save for them.
    const saveAll = async () => {
      for (const t of tabs) {
        if (t.content === t.draft) continue;
        const result = await desktop.save(workspace.id, t.path, t.draft, t.revision);
        if (!alive.current) return;
        setTabs((previous) =>
          previous.map((x) =>
            x.path === t.path
              ? { ...x, content: result.content, revision: result.revision }
              : x,
          ),
        );
      }
    };
    const analyseHere = async () => {
      if (!tab) return;
      try {
        if (dirty) await saveAll();
      } catch (e) {
        notify(errorMessage(e));
        return;
      }
      run(tab.path);
    };
    const analyseInCloud = async () => {
      try {
        if (dirty) await saveAll();
      } catch (e) {
        notify(errorMessage(e));
        return;
      }
      runInCloud?.();
    };
    return (
      <div className="ide" ref={rootRef}>
        <aside className="file-explorer">
          {/* Every open folder, not only the one being edited: closing the
              others out of sight was the part that felt unlike an editor. */}
          {(workspaces?.length ? workspaces : [workspace]).map((w) => (
            <section key={w.id} className="explorer-root">
              <div className="explorer-heading">
                <button
                  className="explorer-toggle"
                  aria-expanded={!collapsed[w.id]}
                  aria-label={`${collapsed[w.id] ? "Déplier" : "Replier"} ${w.name}`}
                  onClick={() =>
                    setCollapsed((all) => ({ ...all, [w.id]: !all[w.id] }))
                  }
                >
                  {collapsed[w.id] ? (
                    <ChevronRight size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                  <span className={w.id === workspace.id ? "current" : undefined}>
                    <FolderOpen size={14} /> {w.name}
                  </span>
                </button>
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
              {!collapsed[w.id] && (
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
              )}
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
                  <div className="menu-anchor">
                    <button
                      className="primary"
                      disabled={busy}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      title="Choisissez où analyser"
                      onClick={() => setMenuOpen((open) => !open)}
                    >
                      <Play size={14} />
                      Analyser
                      <ChevronDown size={13} />
                    </button>
                    {menuOpen && (
                      <div className="menu" role="menu">
                        <button
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            void analyseHere();
                          }}
                        >
                          <Play size={14} />
                          <span>
                            <strong>{dirty ? "Enregistrer et analyser ici" : "Sur cette machine"}</strong>
                            <small>Ce fichier, avec le ctrace installé</small>
                          </span>
                        </button>
                        <button
                          role="menuitem"
                          disabled={!runInCloud}
                          onClick={() => {
                            setMenuOpen(false);
                            void analyseInCloud();
                          }}
                        >
                          <CloudUpload size={14} />
                          <span>
                            <strong>{dirty ? "Enregistrer et analyser dans le cloud" : "Dans le cloud"}</strong>
                            <small>
                              {runInCloud
                                ? "Le dossier ouvert, avec vos CTU"
                                : "Connectez-vous pour analyser dans le cloud"}
                            </small>
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
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
                  Ctrl/Cmd + S : enregistrer · Ctrl/Cmd + P : ouvrir un fichier · Ctrl/Cmd + F : rechercher
                </span>
              </div>
            </>
          ) : (
            <div className="empty centered">
              <FileCode2 size={36} />
              <p>Choisissez un fichier dans l’explorateur, ou Ctrl+P pour le nommer.</p>
              <span className="small muted">{workspace.path}</span>
            </div>
          )}
        </section>
        {quickOpen && (
          <Dialog title="Ouvrir un fichier" close={() => setQuickOpen(false)}>
            <label className="search">
              <Search size={15} />
              <input
                // biome-ignore lint/a11y/noAutofocus: the dialog exists to be typed into
                autoFocus
                aria-label="Nom du fichier"
                placeholder="Nom ou chemin…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCursor((c) => Math.min(c + 1, matches.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCursor((c) => Math.max(c - 1, 0));
                  } else if (e.key === "Enter" && matches[cursor]) {
                    e.preventDefault();
                    chooseQuick(matches[cursor]);
                  }
                }}
              />
            </label>
            <div className="quick-open" role="listbox" aria-label="Fichiers">
              {allFiles === null ? (
                <p className="muted small">Lecture du dossier…</p>
              ) : matches.length === 0 ? (
                <p className="muted small">Aucun fichier ne correspond.</p>
              ) : (
                matches.map((path, i) => (
                  <button
                    key={path}
                    role="option"
                    aria-selected={i === cursor}
                    className={i === cursor ? "selected" : ""}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => chooseQuick(path)}
                  >
                    <FileCode2 size={14} />
                    <strong>{path.split("/").pop()}</strong>
                    <span className="muted small">{path}</span>
                  </button>
                ))
              )}
            </div>
          </Dialog>
        )}
      </div>
    );
  },
);
