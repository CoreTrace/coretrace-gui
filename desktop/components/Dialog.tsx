import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";

export function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      aria-label={title}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon" onClick={close} aria-label="Fermer">
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
/** Resolves true for the action, "alternative" for the second way when one
    is offered, false for Annuler. */
type Ask = (
  title: string,
  detail: string,
  action?: string,
  alternative?: string,
) => Promise<boolean | "alternative">;
const ConfirmContext = createContext<Ask>(async () => false);
export const useConfirm = () => useContext(ConfirmContext);
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<{
    title: string;
    detail: string;
    action: string;
    alternative?: string;
    resolve: (answer: boolean | "alternative") => void;
  } | null>(null);
  const ask: Ask = useCallback(
    (title, detail, action = "Continuer", alternative) =>
      new Promise((resolve) =>
        setRequest({ title, detail, action, alternative, resolve }),
      ),
    [],
  );
  const finish = (answer: boolean | "alternative") => {
    request?.resolve(answer);
    setRequest(null);
  };
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {request && (
        <Dialog title={request.title} close={() => finish(false)}>
          <p>{request.detail}</p>
          <footer>
            <button onClick={() => finish(false)}>Annuler</button>
            {request.alternative && (
              <button onClick={() => finish("alternative")}>
                {request.alternative}
              </button>
            )}
            <button className="primary" onClick={() => finish(true)}>
              {request.action}
            </button>
          </footer>
        </Dialog>
      )}
    </ConfirmContext.Provider>
  );
}
