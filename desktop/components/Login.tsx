import { useEffect, useState } from "react";
import { ExternalLink, LoaderCircle } from "lucide-react";
import { desktop, errorMessage } from "../bridge";
import type { DeviceCode } from "../types";
import { Dialog } from "./Dialog";

export function Login({
  close,
  connected,
}: {
  close: () => void;
  connected: () => Promise<void>;
}) {
  const [code, setCode] = useState<DeviceCode | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [copied, setCopied] = useState(false);
  const restart = () => {
    setCode(null);
    setError("");
    setCopied(false);
    setAttempt((value) => value + 1);
  };
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let clock: ReturnType<typeof setInterval>;
    let interval = 1000;
    const poll = async () => {
      try {
        const signedIn = await desktop.pollLogin();
        if (stopped) return;
        if (signedIn) {
          await connected();
          if (!stopped) close();
        } else timer = setTimeout(poll, interval);
      } catch (e) {
        if (!stopped) setError(errorMessage(e));
      }
    };
    void desktop
      .login()
      .then((value) => {
        if (!stopped) {
          setCode(value);
          interval = Math.max(1000, value.interval * 1000);
          const deadline = Date.now() + value.expiresIn * 1000;
          setRemaining(value.expiresIn);
          clock = setInterval(() => {
            const seconds = Math.max(
              0,
              Math.ceil((deadline - Date.now()) / 1000),
            );
            setRemaining(seconds);
            if (!seconds) {
              clearTimeout(timer);
              clearInterval(clock);
              setError("Le code a expiré. Demandez un nouveau code.");
            }
          }, 1000);
          timer = setTimeout(poll, interval);
        }
      })
      .catch((e) => {
        if (!stopped) setError(errorMessage(e));
      });
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(clock);
    };
  }, [attempt]);
  useEffect(
    () => () => {
      void desktop.cancelLogin().catch(() => {});
    },
    [],
  );
  return (
    <Dialog title="Connexion à CoreTrace" close={close}>
      <p>
        Validez ce code dans votre navigateur. Votre session sera conservée dans
        le coffre-fort du système.
      </p>
      {code ? (
        <>
          <div className="device-code">{code.userCode}</div>
          <p className="muted">
            Code valable {Math.ceil(remaining / 60)} minutes.
          </p>
          <button
            disabled={!remaining}
            onClick={() => {
              void navigator.clipboard
                .writeText(code.userCode)
                .then(() => setCopied(true))
                .catch(() =>
                  setError("Copiez le code affiché pour continuer."),
                );
            }}
          >
            {copied ? "Code copié" : "Copier le code"}
          </button>
          <button
            disabled={!remaining}
            className="primary"
            onClick={() =>
              void desktop
                .openAccount("device")
                .catch((e) => setError(errorMessage(e)))
            }
          >
            Ouvrir la connexion <ExternalLink size={16} />
          </button>
          <p className="muted small">{code.verificationUri}</p>
          {!error && (
            <p className="inline">
              <LoaderCircle className="spin" size={16} /> En attente de
              validation…
            </p>
          )}
        </>
      ) : (
        !error && <p>Préparation de la connexion…</p>
      )}
      {error && (
        <>
          <p role="alert" className="error">
            {error}
          </p>
          <button onClick={restart}>Demander un nouveau code</button>
        </>
      )}
    </Dialog>
  );
}
