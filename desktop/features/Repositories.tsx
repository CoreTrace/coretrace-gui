import { ArrowUpRight, FolderGit2, GitBranch, Search } from "lucide-react";
import { desktop, errorMessage } from "../bridge";
import type { CloudModel } from "../useCloud";
import type { Repository } from "../types";
import { useState } from "react";
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
  const needle = search.trim().toLowerCase();
  const shown = needle
    ? cloud.repositories.filter((r) =>
        r.full_name.toLowerCase().includes(needle),
      )
    : cloud.repositories;
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
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="muted small">
            {search.trim()
              ? `${shown.length} sur ${cloud.repositories.length}`
              : `${cloud.repositories.length} dépôts`}
          </span>
        </label>
      )}
      {cloud.repositories.length ? (
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
                <button onClick={() => clone(repo.full_name)}>
                  Ouvrir dans l’IDE
                </button>
                <button
                  className="primary"
                  disabled={!repo.enabled}
                  onClick={() => analyse(repo)}
                >
                  Analyser
                </button>
              </footer>
            </article>
          ))}
        </div>
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
