import { Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { desktop, errorMessage } from "../bridge";
import { Dialog } from "../components/Dialog";
import type { LocalResult } from "../types";

/** What the platform accepts: log plus files. */
const CAP = 2 * 1024 * 1024;
const LOG_LIMIT = 512 * 1024;
const DESKTOP_VERSION = "6.0.0-beta.1";

/** The tools ctrace said did not complete, from its own summary lines. */
export function failedTools(output: string): string[] {
  const tools: string[] = [];
  for (const line of output.split("\n")) {
    const m = /== CoreTrace == \[WARN\] \(([^)]+)\)/.exec(line);
    if (m && !tools.includes(m[1])) tools.push(m[1]);
  }
  return tools.length ? tools : ["ctrace"];
}

/** The first line that reads like the reason; tells one failure from another. */
function signature(output: string): string {
  const line =
    output
      .split("\n")
      .map((l) => l.trim())
      .find((l) => /error|failed|not found|cannot/i.test(l)) ?? "";
  return line.slice(0, 200);
}

/** Head and tail past the limit: the start says what ran, the end how it ended. */
function truncate(log: string): string {
  if (log.length <= LOG_LIMIT) return log;
  const half = LOG_LIMIT / 2;
  return `${log.slice(0, half)}\n[… journal tronqué : ${log.length - LOG_LIMIT} caractères omis …]\n${log.slice(-half)}`;
}

function kilobytes(n: number): string {
  return n < 1024 ? `${n} o` : `${Math.round(n / 1024)} Ko`;
}

/**
 * Asks what the team needs to reproduce a failed tool, says plainly what will
 * be sent and that it stays private, and sends it. One report per run: the
 * caller disables the way in once `onSent` has fired.
 */
export function ReportDialog({
  workspaceId,
  local,
  onClose,
  onSent,
}: {
  workspaceId: string;
  local: LocalResult;
  onClose: () => void;
  onSent: (id: string) => void;
}) {
  const output = `${local.stdout}\n${local.stderr}`;
  const log = useMemo(() => truncate(output), [output]);
  const tools = useMemo(() => failedTools(output), [output]);
  const [candidates, setCandidates] = useState<
    { name: string; bytes: number }[]
  >([]);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [extra, setExtra] = useState<{ name: string; content: string }[]>([]);
  const [libraries, setLibraries] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void desktop
      .supportCandidates(workspaceId)
      .then((found) => {
        if (!live) return;
        setCandidates(found);
        // Ticked by default: these are the files the question asks for.
        setTicked(Object.fromEntries(found.map((f) => [f.name, true])));
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [workspaceId]);

  const attachedBytes =
    candidates.filter((c) => ticked[c.name]).reduce((n, c) => n + c.bytes, 0) +
    extra.reduce((n, f) => n + f.content.length, 0);
  const total = log.length + attachedBytes;
  const lines = log.split("\n").length;

  const addFile = () => {
    const name = window.prompt(
      "Chemin du fichier, relatif au dossier ouvert :",
    );
    if (!name) return;
    void desktop
      .supportReadFile(workspaceId, name)
      .then((content) =>
        setExtra((list) => [
          ...list.filter((f) => f.name !== name),
          { name: name.split(/[\\/]/).pop() ?? name, content },
        ]),
      )
      .catch((e) => setError(errorMessage(e)));
  };

  const send = async () => {
    setSending(true);
    setError("");
    try {
      const files = [...extra];
      for (const c of candidates) {
        if (ticked[c.name]) {
          files.push({
            name: c.name,
            content: await desktop.supportReadFile(workspaceId, c.name),
          });
        }
      }
      const id = await desktop.supportSend({
        tools,
        signature: signature(output),
        ctrace_version:
          /ctrace\D{0,12}(\d+\.\d+\.\d+)/.exec(local.stdout)?.[1] ?? "",
        desktop_version: DESKTOP_VERSION,
        os: "",
        libraries,
        log,
        files,
      });
      await desktop.supportMarkReported(workspaceId, local.runId);
      onSent(id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog title="Signaler l’échec d’un outil" close={onClose}>
      <p>
        Sera envoyé : le journal complet de ctrace ({lines} lignes,{" "}
        {kilobytes(log.length)}), la version de ctrace, votre système et la
        version de CoreTrace Desktop. Outils concernés :{" "}
        <strong>{tools.join(", ")}</strong>.
      </p>
      <label>
        Quelles librairies utilisez-vous dans votre projet ?
        <textarea
          rows={3}
          value={libraries}
          onChange={(e) => setLibraries(e.target.value)}
          placeholder="SDL2, libcurl, un allocateur maison…"
        />
      </label>
      <fieldset className="report-files">
        <legend>
          Fournissez votre Makefile / CMakeLists.txt / configuration de build
        </legend>
        {candidates.length === 0 && extra.length === 0 && (
          <p className="muted small">
            Aucun fichier de build trouvé à la racine du dossier.
          </p>
        )}
        {candidates.map((c) => (
          <label key={c.name} className="checkbox">
            <input
              type="checkbox"
              checked={!!ticked[c.name]}
              onChange={(e) =>
                setTicked({ ...ticked, [c.name]: e.target.checked })
              }
            />
            {c.name} <span className="muted small">{kilobytes(c.bytes)}</span>
          </label>
        ))}
        {extra.map((f) => (
          <label key={f.name} className="checkbox">
            <input
              type="checkbox"
              checked
              onChange={() =>
                setExtra((list) => list.filter((x) => x.name !== f.name))
              }
            />
            {f.name}{" "}
            <span className="muted small">{kilobytes(f.content.length)}</span>
          </label>
        ))}
        <button type="button" onClick={addFile}>
          Ajouter un fichier…
        </button>
        <p className={`small ${total > CAP ? "error" : "muted"}`}>
          Total : {kilobytes(total)} sur {kilobytes(CAP)}
          {total > CAP ? " — retirez une pièce jointe." : "."}
        </p>
      </fieldset>
      <p>
        <strong>
          Ces données restent privées. Nous les examinons uniquement pour
          améliorer et mettre à jour nos outils.
        </strong>
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <button onClick={onClose}>Annuler</button>
        <button
          className="primary"
          disabled={sending || total > CAP}
          onClick={() => void send()}
        >
          <Send size={15} /> {sending ? "Envoi…" : "Envoyer"}
        </button>
      </footer>
    </Dialog>
  );
}
