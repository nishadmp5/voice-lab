"use client";

import { useEffect } from "react";

// Explicit registration avoids depending on Webpack's changing App Router entry names.
export function PwaRegistration() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    )
      return;
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error: unknown) => {
        console.warn("Offline mode could not be initialized:", error);
      });
  }, []);
  return null;
}
