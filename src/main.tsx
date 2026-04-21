import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@mantine/core/styles.css";
import "@mantine/dropzone/styles.css";
import { MantineProvider } from "@mantine/core";
import "./index.css";
import App from "./components/App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="auto">
      <App />
    </MantineProvider>
  </StrictMode>,
);
