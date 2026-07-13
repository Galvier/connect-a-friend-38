// Helpers to interpret Evolution API responses consistently across the app.

export type ConnState = "open" | "close" | "connecting" | "unknown";

/**
 * Extract the connection state from an Evolution API `connectionState` payload.
 * Handles several response shapes seen across Evolution versions.
 */
export function extractState(data: unknown): ConnState {
  if (!data || typeof data !== "object") return "unknown";
  const d = data as Record<string, unknown>;
  const inner = ((d.data as Record<string, unknown> | undefined) ?? d);
  const instance = (inner.instance as Record<string, unknown> | undefined) ?? inner;

  const raw =
    (instance.state as string | undefined) ??
    (inner.state as string | undefined) ??
    (d.state as string | undefined);

  if (raw === "open" || raw === "connected") return "open";
  if (raw === "connecting") return "connecting";
  if (raw === "close" || raw === "closed" || raw === "disconnected") return "close";

  if (typeof instance.LoggedIn === "boolean") return instance.LoggedIn ? "open" : "close";
  if (typeof inner.LoggedIn === "boolean") return inner.LoggedIn ? "open" : "close";
  if (typeof instance.Connected === "boolean") return instance.Connected ? "open" : "close";

  return "unknown";
}

export function isConnected(data: unknown): boolean {
  return extractState(data) === "open";
}
