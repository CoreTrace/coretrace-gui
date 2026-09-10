import { createRoot } from "react-dom/client";
import App from "./App";
import { ConfirmProvider } from "./components/Dialog";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <ConfirmProvider>
    <App />
  </ConfirmProvider>,
);
