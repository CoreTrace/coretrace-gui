import { ArrowUpRight, FolderGit2, GitBranch, Search } from "lucide-react";
import { desktop, errorMessage, native } from "../bridge";
import type { CloudModel } from "../useCloud";
import type { Repository } from "../types";
import { useEffect, useState } from "react";

/** Repository cards shown at once, and added per "Afficher plus". */
const PAGE = 6;

export function Repositories({
  cloud,
  clone,
  analyse,
  notify,
}: {
  cloud: CloudModel;
  clone: (name?: string) => void;
  analyse: (repo: Repository) => void;
  notify: (message: string) => void;
}) {
  const [search, setSearch] = useState("");
  // An organisation can have hundreds of repositories, and a wall of cards is
  // not a list anyone reads. Show a handful and let the reader ask for more.
  const [limit, setLimit] = useState(PAGE);
  // Which repositories are already on this machine: their card can say
  // "open" instead of promising a download that will not happen.
  const [cloned, setCloned] = useState<string[]>([]);
  useEffect(() => {
    if (!native) return;
    void desktop
      .clonedRepositories()
      .then(setCloned)
      .catch(() => setCloned([]));
  }, []);
  const needle = search.trim().toLowerCase();
  const matching = needle
    ? cloud.repositories.filter((r) =>
        r.full_name.toLowerCase().includes(needle),
      )
    : cloud.repositories;
  // A search looks through every repository, not only the ones on screen.
  const shown = matching.slice(0, limit);
  const remaining = matching.length - shown.length;
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CODE & SOURCES</div>
          <h1>Dépôts</h1>
          <p>
            Retrouvez les dépôts de votre organisation ou clonez un projet
            GitHub.
          </p>
        </div>
        <button className="primary" onClick={() => clone()}>
          <GitBranch size={16} />
          Cloner un dépôt
        </button>
      </div>
      <div className="section-heading">
        <h2>
          Dépôts connectés{" "}
          {cloud.org && <span className="muted">/ {cloud.org}</span>}
        </h2>
        <button
          onClick={() =>
            void desktop
              .openAccount("repositories")
              .catch((e) => notify(errorMessage(e)))
          }
        >
          Gérer les connexions <ArrowUpRight size={14} />
        </button>
      </div>
      {cloud.repositories.length > 0 && (
        <label className="search">
          <Search size={15} />
          <input
            aria-label="Rechercher un dépôt"
            placeholder="Rechercher un dépôt…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(PAGE);
            }}
          />
          <span className="muted small count">
            {search.trim()
              ? `${matching.length} sur ${cloud.repositories.length}`
              : `${cloud.repositories.length} dépôts`}
          </span>
        </label>
      )}
      {cloud.repositories.length ? (
        <>
          <div className="repository-grid">
            {shown.map((repo) => (
              <article className="repository-card" key={repo.id}>
                <div className="inline">
                  <FolderGit2 size={22} />
                  <span className={`badge ${repo.enabled ? "clean" : ""}`}>
                    {repo.enabled ? "Analyse activée" : "Analyse désactivée"}
                  </span>
                </div>
                <h3>{repo.full_name}</h3>
                <p className="muted small">
                  <GitBranch size={13} /> {repo.default_branch}
                </p>
                <footer>
                  <button
                    title={
                      cloned.includes(repo.full_name)
                        ? "Déjà cloné sur cette machine"
                        : "Télécharge une copie sur cette machine, puis l’ouvre"
                    }
                    onClick={() => clone(repo.full_name)}
                  >
                    {cloned.includes(repo.full_name)
                      ? "Ouvrir"
                      : "Cloner et ouvrir"}
                  </button>
                  {repo.enabled ? (
                    <button className="primary" onClick={() => analyse(repo)}>
                      Analyser
                    </button>
                  ) : (
                    // Enabling happens on the web; a disabled button here only
                    // said no without saying where yes was.
                    <button
                      onClick={() =>
                        void desktop
                          .openAccount("repositories")
                          .catch((e) => notify(errorMessage(e)))
                      }
                    >
                      Activer sur le web <ArrowUpRight size={14} />
                    </button>
                  )}
                </footer>
              </article>
            ))}
          </div>
          {remaining > 0 && (
            <button
              className="show-more"
              onClick={() => setLimit((current) => current + PAGE)}
            >
              Afficher plus ({remaining} restants)
            </button>
          )}
        </>
      ) : (
        <div className="empty">
          <FolderGit2 size={36} />
          <h2>
            {cloud.me
              ? "Aucun dépôt GitHub connecté"
              : "Connectez votre compte CoreTrace"}
          </h2>
          <p>
            La plateforme liste les dépôts autorisés par l’installation GitHub
            de votre organisation.
          </p>
          <p className="small muted">
            Le clonage manuel reste disponible sans connexion CoreTrace.
          </p>
        </div>
      )}
    </div>
  );
}
