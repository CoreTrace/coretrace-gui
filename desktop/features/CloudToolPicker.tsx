import { useEffect, useMemo, useState } from "react";
import { desktop } from "../bridge";
import { defaultTools, languagesOf, planFor } from "../cloudTools";
import type { Plan, Tool, Workspace } from "../types";

export type ToolSelection = {
  /** The ids that will run, in the order the platform lists them. */
  selected: string[];
  /** What the platform would have chosen for this folder on its own. */
  defaults: string[];
  /** Whether the selection differs from the defaults. */
  edited: boolean;
  /** What to send to `startCloudRun`: nothing while the selection is the
      defaults, so the platform chooses exactly as it did before the reader
      could; the chosen ids once they differ. */
  request: string[];
  toggle: (id: string) => void;
};

/** Where the last choice for a folder is kept. Workspace ids are new each
    time a folder is opened, so the folder's path names it. */
const storageKey = (path: string) => `coretrace.cloudTools:${path}`;

/** The tools last chosen for this folder, or null when none were. Storage can
    be blocked or wiped; then the defaults apply, as on a first run. */
function recall(path: string): string[] | null {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey(path)) ?? "null");
    return Array.isArray(stored) && stored.every((id) => typeof id === "string")
      ? stored
      : null;
  } catch {
    return null;
  }
}

function remember(path: string, chosen: string[] | null) {
  try {
    if (chosen) localStorage.setItem(storageKey(path), JSON.stringify(chosen));
    else localStorage.removeItem(storageKey(path));
  } catch {
    // Not remembered: the next run of this folder starts from the defaults.
  }
}

/**
 * The tools a cloud run of this folder will use. Until the reader touches the
 * list it follows the defaults, which change as the folder's files and the
 * organisation's catalogue arrive; once they have chosen, it is theirs, and it
 * is still theirs the next time they analyse this folder.
 */
export function useToolSelection(
  workspace: Pick<Workspace, "id" | "path">,
  tools: readonly Tool[],
): ToolSelection {
  const { id: workspaceId, path } = workspace;
  const [languages, setLanguages] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string[] | null>(() => recall(path));

  useEffect(() => {
    let current = true;
    setLanguages([]);
    setChosen(recall(path));
    // Without the file list nothing is preselected and the reader picks by
    // hand: a listing that fails is no reason to refuse the run.
    Promise.resolve()
      .then(() => desktop.allFiles(workspaceId))
      .then((files) => {
        if (current) setLanguages(languagesOf(files ?? []));
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [workspaceId, path]);

  const defaults = useMemo(
    () => defaultTools(tools, languages),
    [tools, languages],
  );
  // A remembered choice can name tools the plan has since lost, or that left
  // the catalogue: only what can run now is selected, in the platform's order.
  const selected = useMemo(
    () =>
      chosen
        ? tools
            .filter((t) => t.entitled && chosen.includes(t.id))
            .map((t) => t.id)
        : defaults,
    [chosen, tools, defaults],
  );
  // Both lists follow the platform's order, so equal sets are equal arrays.
  const edited =
    selected.length !== defaults.length ||
    selected.some((id, i) => id !== defaults[i]);

  return {
    selected,
    defaults,
    edited,
    request: edited ? selected : [],
    toggle: (id) => {
      const ticked = selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id];
      // Keep the platform's order, whatever order the reader ticked them in.
      const next = tools.map((t) => t.id).filter((t) => ticked.includes(t));
      // Back to the defaults is no choice at all: forget it, so the folder
      // follows the defaults again when the plan or the files change.
      const own =
        next.length === defaults.length &&
        next.every((x, i) => x === defaults[i])
          ? null
          : next;
      setChosen(own);
      remember(path, own);
    },
  };
}

/**
 * Every tool of the catalogue, with the ones the plan does not include shown
 * but locked: hiding them would leave the reader not knowing they exist.
 */
export function CloudToolPicker({
  tools,
  plans,
  selection,
  disabled,
}: {
  tools: readonly Tool[];
  /** Every plan, cheapest first; empty when they could not be read. */
  plans: readonly Plan[];
  selection: ToolSelection;
  disabled?: boolean;
}) {
  if (tools.length === 0) return null;
  return (
    <fieldset className="tool-picker" disabled={disabled}>
      <legend>Outils</legend>
      {tools.map((tool) => (
        <label key={tool.id} className="checkbox">
          <input
            type="checkbox"
            disabled={!tool.entitled}
            checked={tool.entitled && selection.selected.includes(tool.id)}
            onChange={() => selection.toggle(tool.id)}
          />
          {tool.id}{" "}
          {tool.entitled ? (
            <span className="muted small">{tool.languages.join(", ")}</span>
          ) : (
            <span className="muted small">
              {locked(tool.required_entitlement, plans)}
            </span>
          )}
        </label>
      ))}
      {selection.edited && selection.selected.length === 0 && (
        <p className="muted small">
          Choisissez au moins un outil pour lancer l’analyse.
        </p>
      )}
    </fieldset>
  );
}

/** Why a tool is locked, naming the plan that unlocks it when one is known.
    An entitlement is a feature id, never something to show the reader. */
function locked(entitlement: string, plans: readonly Plan[]): string {
  const plan = planFor(entitlement, plans);
  // The platform names plans as ids ("pro"); the reader reads them as names.
  return plan
    ? `Inclus dans l’offre ${plan.charAt(0).toUpperCase()}${plan.slice(1)}`
    : "Non inclus dans votre offre";
}
