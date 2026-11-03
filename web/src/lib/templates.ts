// Service templates a Deed can run, keyed by the public config fingerprint (config_hash) the owner
// signs at activation. The Preflight runtime itself is on the roadmap; until it ships, a switched-on
// Deed records the owner's intent on chain but no runtime answers jobs yet.
export interface Template {
  title: string
  tagline: string
  model: string
}

const KNOWN: Record<string, Template> = {
  "3f79bb7b435b05321651daefd374cdc681dc06faa65e374e38337b88ca046dea": {
    title: "Preflight",
    tagline: "Explains a NEAR transaction in plain words and flags anything risky, before you sign it.",
    model: "NEAR AI verifiable model (runtime on the roadmap)",
  },
}

export const PREFLIGHT_CONFIG_HASH = "3f79bb7b435b05321651daefd374cdc681dc06faa65e374e38337b88ca046dea"

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
