// Service templates a Deed can run, keyed by the public config fingerprint (config_hash) the owner
// signs at activation. Preflight is served by runtime/ (Bun), which answers only for the current owner.
export interface Template {
  title: string
  tagline: string
  model: string
}

// Keys are sha256 of runtime/preflight.config.json (the runtime serves only this exact hash).
const KNOWN: Record<string, Template> = {
  "8c5e8df1eb3fe3269550cd6a982b40991bbc7288303dd5a66cd90448f9e0f064": {
    title: "Preflight",
    tagline: "Explains a NEAR transaction in plain words and flags anything risky, before you sign it.",
    model: "z-ai/glm-5.3-flash on NEAR AI (TEE-signed answers)",
  },
  // Placeholder fingerprint used by the first live test sales, before the config file existed.
  "3f79bb7b435b05321651daefd374cdc681dc06faa65e374e38337b88ca046dea": {
    title: "Preflight",
    tagline: "Explains a NEAR transaction in plain words and flags anything risky, before you sign it.",
    model: "z-ai/glm-5.3-flash on NEAR AI (TEE-signed answers)",
  },
}

export const PREFLIGHT_CONFIG_HASH = "8c5e8df1eb3fe3269550cd6a982b40991bbc7288303dd5a66cd90448f9e0f064"

export function templateFor(hash: string | null): Template {
  if (hash && KNOWN[hash]) return KNOWN[hash]
  return {
    title: hash ? "Custom service" : "Not switched on",
    tagline: hash
      ? "An AI service with a custom public config."
      : "A Deed with no active service. Its owner can switch one on.",
    model: hash ? "custom" : "none",
  }
}
