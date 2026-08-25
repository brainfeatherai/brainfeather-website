"use client";

/* Last-resort client error boundary. When it renders, the React tree
   underneath has unmounted — the only recovery is a reload, so that is
   what this offers. Reporting to Sentry here catches errors that bypass
   both instrumentation-client's global handlers and any nearer
   boundary. */

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f7f5ef",
          color: "#1d3b2a",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
            Something broke
          </h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", opacity: 0.7 }}>
            The error was reported automatically. Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              padding: "0.6rem 1.25rem",
              borderRadius: "9999px",
              background: "#1d3b2a",
              color: "#f7f5ef",
              border: "none",
              cursor: "pointer",
              fontSize: "0.8rem",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              fontFamily: "monospace",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
