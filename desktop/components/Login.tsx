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
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const signedIn = await desktop.pollLogin();
        if (stopped) return;
        if (signedIn) {
          await connected();
          if (!stopped) close();
        } else timer = setTimeout(poll, 1000);
      } catch (e) {
        if (!stopped) setError(errorMessage(e));
      }
    };
    void desktop
      .login()
      .then((value) => {
        if (!stopped) {
          setCode(value);
          timer = setTimeout(poll, value.interval * 1000);
        }
      })
      .catch((e) => {
        if (!stopped) setError(errorMessage(e));
      });
    return () => {
      stopped = true;
      clearTimeout(timer);
      void desktop.cancelLogin().catch(() => {});
    };
  }, []); // One native device flow per dialog; callbacks are read for this attempt.
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
            Code valable {Math.ceil(code.expiresIn / 60)} minutes.
          </p>
          <button
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
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </Dialog>
  );
}
