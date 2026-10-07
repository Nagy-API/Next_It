"use client";

/**
 * Last line of defence: if even the main layout fails, people get a calm page with "Try again" instead of a
 * blank "Internal Server Error". It renders its own document (no app styles), so styles are inline.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#f5f7fb", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", color: "#0b1639" }}>
        <title>NEXORA Ops</title>
        <div style={{ maxWidth: 460, margin: 16, padding: 32, background: "#fff", borderRadius: 16, border: "1px solid #e3e8f2", textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Something went wrong for a moment</h1>
          <p style={{ fontSize: 14, color: "#5b6785", margin: "0 0 20px" }}>Nothing was lost — your work is saved. Please try again.</p>
          <button type="button" onClick={() => retry()} style={{ height: 40, padding: "0 18px", borderRadius: 12, border: 0, background: "#3b82f6", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
          {error.digest && <p style={{ fontSize: 12, color: "#8a94ad", marginTop: 20 }}>Code: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
