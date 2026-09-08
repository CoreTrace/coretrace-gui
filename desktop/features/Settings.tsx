import { ArrowUpRight, LogOut, Settings2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { desktop, errorMessage } from "../bridge";
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
  const [memberError, setMemberError] = useState("");
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
            <strong>{cloud.me?.principal.name || "Non connecté"}</strong>
            <p className="muted">
              {cloud.me?.email ||
                "Connectez-vous pour retrouver vos organisations."}
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
        <p className="muted small">
          Plateforme : {cloud.baseUrl || "Chargement…"}
        </p>
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
                  if (path) setAnalyser(path);
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
