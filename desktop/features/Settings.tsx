import { ArrowUpRight, Github, LogOut, Settings2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { desktop, errorMessage, native, type AnalysisOptions } from "../bridge";
import type { CloudModel } from "../useCloud";
import type { Member } from "../types";
export function Settings({
  cloud,
  analyser,
  setAnalyser,
  login,
  notify,
}: {
  cloud: CloudModel;
  analyser: string;
  setAnalyser: (value: string) => void;
  login: () => void;
  notify: (message: string) => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [connectingGitHub, setConnectingGitHub] = useState(false);
  const [cloneLocation, setCloneLocation] = useState("");
  const githubConnected =
    cloud.me?.identities?.includes("https://github.com") ?? false;

  /**
   * GitHub's consent screen cannot be hosted here, and the platform binds the
   * flow to the signed-in session, so it finishes in the browser. Poll the
   * identity afterwards rather than asking the user to come back and refresh.
   */
  async function connectGitHub() {
    setConnectingGitHub(true);
    try {
      await desktop.connectGitHub();
      for (let attempt = 0; attempt < 60; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await cloud.reconnect();
        if (cloud.me?.identities?.includes("https://github.com")) break;
      }
    } catch (e) {
      notify(errorMessage(e));
    } finally {
      setConnectingGitHub(false);
    }
  }
  const [memberError, setMemberError] = useState("");
  const [options, setOptions] = useState<AnalysisOptions>({
    config: null,
    compileCommands: null,
  });
  useEffect(() => {
    if (native)
      void desktop
        .cloneLocation()
        .then(setCloneLocation)
        .catch(() => setCloneLocation(""));
  }, []);
  useEffect(() => {
    if (native)
      void desktop
        .analysisOptions()
        .then(setOptions)
        .catch((e) => notify(errorMessage(e)));
  }, [notify]);
  useEffect(() => {
    let active = true;
    setMembers([]);
    setMemberError("");
    if (cloud.org)
      void desktop
        .readCloud<Member[]>("members", cloud.org)
        .then((rows) => {
          if (active) setMembers(rows);
        })
        .catch((e) => {
          if (active) setMemberError(errorMessage(e));
        });
    return () => {
      active = false;
    };
  }, [cloud.org]);
  return (
    <div className="page settings">
      <div className="eyebrow">VOTRE CONFIGURATION</div>
      <h1>Paramètres</h1>
      <section className="panel">
        <h2>Compte CoreTrace</h2>
        <div className="setting-row">
          <div>
            {/* The platform names only API keys, so a signed-in human has no
                principal name; the e-mail is the identity to show. */}
            <strong>
              {cloud.me
                ? cloud.me.principal.name ||
                  cloud.me.email ||
                  "Compte connecté"
                : "Non connecté"}
            </strong>
            <p className="muted">
              {cloud.me
                ? cloud.me.orgs.length > 0
                  ? cloud.me.orgs.map((o) => o.slug).join(", ")
                  : "Aucune organisation"
                : "Connectez-vous pour retrouver vos organisations."}
            </p>
          </div>
          {cloud.me ? (
            <button
              onClick={() =>
                void cloud.signOut().catch((e) => notify(errorMessage(e)))
              }
            >
              <LogOut size={15} />
              Se déconnecter
            </button>
          ) : (
            <button onClick={login}>Se connecter</button>
          )}
        </div>
        {cloud.me && (
          <div className="setting-row">
            <div>
              <strong>Compte GitHub</strong>
              <p className="muted">
                {githubConnected
                  ? "CoreTrace retrouve les dépôts où l’application est déjà installée."
                  : "Connectez GitHub pour retrouver vos dépôts sans réinstaller l’application."}
              </p>
            </div>
            {githubConnected ? (
              <span className="pill connected">
                <Github size={15} />
                GitHub connecté
              </span>
            ) : (
              <button
                className="pill"
                disabled={connectingGitHub}
                onClick={() => void connectGitHub()}
              >
                <Github size={15} />
                {connectingGitHub ? "Terminez dans le navigateur…" : "Connecter GitHub"}
              </button>
            )}
          </div>
        )}
        <p className="muted small">
          Plateforme : {cloud.baseUrl || "Chargement…"}
        </p>
        {cloneLocation && (
          <p className="muted small">
            Dépôts clonés dans : <code>{cloneLocation}</code>
          </p>
        )}
        <button
          onClick={() =>
            void desktop
              .openAccount("settings")
              .catch((e) => notify(errorMessage(e)))
          }
        >
          Gérer mon compte sur le web <ArrowUpRight size={14} />
        </button>
      </section>
      <section className="panel">
        <div className="inline">
          <Settings2 size={19} />
          <h2>Analyseur local</h2>
        </div>
        <p>
          Sélectionnez le programme <code>ctrace</code> installé sur votre
          machine. Les outils qu’il appelle doivent également être installés.
        </p>
        <div className="setting-row">
          <code className="path-value">
            {analyser || "Aucun exécutable sélectionné"}
          </code>
          <button
            onClick={() =>
              void desktop
                .chooseAnalyser()
                .then((path) => {
                  if (path) {
                    setAnalyser(path);
                    void desktop.analysisOptions().then(setOptions);
                  }
                })
                .catch((e) => notify(errorMessage(e)))
            }
          >
            Choisir ctrace
          </button>
        </div>
        <p className="muted small">
          Le lancement est explicite depuis le fichier actif de l’IDE. Le choix
          vaut pour cette session.
        </p>
        {(
          [
            ["config", "Configuration des outils", "Choisir la configuration"],
            [
              "compileCommands",
              "Compilation du projet",
              "Choisir compile_commands.json",
            ],
          ] as const
        ).map(([kind, label, button]) => (
          <div className="setting-row" key={kind}>
            <div>
              <strong>{label}</strong>
              <p className="path-value">
                {options[kind] || "Aucun fichier sélectionné"}
              </p>
            </div>
            <div className="inline">
              <button
                onClick={() =>
                  void desktop
                    .chooseAnalysisFile(kind)
                    .then(setOptions)
                    .catch((e) => notify(errorMessage(e)))
                }
              >
                {button}
              </button>
              {options[kind] && (
                <button
                  aria-label={`Retirer : ${label}`}
                  onClick={() =>
                    void desktop
                      .chooseAnalysisFile(kind, true)
                      .then(setOptions)
                      .catch((e) => notify(errorMessage(e)))
                  }
                >
                  Retirer
                </button>
              )}
            </div>
          </div>
        ))}
        <p className="muted small">
          La configuration choisie définit les outils à lancer. Sans fichier,
          tous les outils statiques sont demandés. La base de compilation
          fournit les options C/C++ et les chemins d’inclusion. Sans sélection,
          CoreTrace cherche une base contenant le fichier actif, puis en génère
          une minimale. Les distributions CoreTrace configurent automatiquement
          leurs outils. Les outils absents doivent être installés ou retirés de
          votre configuration.
        </p>
      </section>
      {cloud.me && (
        <section className="panel">
          <div className="inline">
            <Users size={19} />
            <h2>Membres de {cloud.org}</h2>
          </div>
          {memberError && <p className="error">{memberError}</p>}
          {members.map((member) => (
            <div className="setting-row" key={member.user_id}>
              <code>{member.user_id}</code>
              <span className="badge">{member.role}</span>
            </div>
          ))}
        </section>
      )}
      <p className="muted small">CoreTrace 6.0.0-beta.1 · Tauri + React</p>
    </div>
  );
}
