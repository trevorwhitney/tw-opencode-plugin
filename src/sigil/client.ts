import { SigilClient } from "@grafana/sigil-sdk-js";
import type { SigilConfig, SigilAuthConfig } from "../shared/config.js";

// Matches ExportAuthConfig from @grafana/sigil-sdk-js (not re-exported from package index)
type ResolvedAuth = {
  mode: "none" | "tenant" | "bearer";
  tenantId?: string;
  bearerToken?: string;
};

export function resolveEnvVars(value: string): string {
  return value.replace(/\$\{(\w+)\}/g, (_match, name) => {
    return process.env[name] ?? "";
  });
}

function resolveAuth(auth: SigilAuthConfig): ResolvedAuth {
  switch (auth.mode) {
    case "bearer":
      return { mode: "bearer", bearerToken: resolveEnvVars(auth.bearerToken) };
    case "tenant":
      return { mode: "tenant", tenantId: resolveEnvVars(auth.tenantId) };
    case "none":
      return { mode: "none" };
  }
}

export function createSigilClient(config: SigilConfig): SigilClient | null {
  try {
    const auth = resolveAuth(config.auth);
    return new SigilClient({
      generationExport: {
        protocol: "http",
        endpoint: config.endpoint,
        auth,
      },
    });
  } catch {
    console.warn("[sigil] failed to create SigilClient");
    return null;
  }
}
