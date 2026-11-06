// Network config comes from the deploy script's output (deploy/testnet.json), never hardcoded.
import testnet from "../../../deploy/testnet.json"

export const CONFIG = {
  network: "testnet" as const,
  rpc: (import.meta.env.VITE_RPC as string | undefined) ?? testnet.rpc,
  /** FastNEAR transaction API: every tx that touched an account, with receipts and logs. */
  txApi: (import.meta.env.VITE_TX_API as string | undefined) ?? "https://tx.test.fastnear.com",
  /** The Preflight runtime (runtime/). Local by default; set VITE_RUNTIME_URL for a hosted one. */
  runtime: (import.meta.env.VITE_RUNTIME_URL as string | undefined) ?? "http://localhost:8787",
  registry: testnet.registry,
  deed: testnet.deed,
  tla: testnet.tla,
  root: testnet.root,
  royaltyBps: testnet.royaltyBps,
  mainnetCodeHashes: testnet.mainnetCodeHashes as Record<string, string>,
  /** Known runtimes: runtime_id (as named in a Deed's activation) → URL. A buyer running their own adds theirs. */
  runtimes: ((testnet as { runtimes?: Record<string, string> }).runtimes ?? {}) as Record<string, string>,
  /** The demo agent's vault (contract/agent-vault) and the shared blocklist (contract/reports). */
  agentVault: (testnet as { agentVault?: string }).agentVault ?? "",
  reports: (testnet as { reports?: string }).reports ?? "",
}

/** Accounts our own scripts use. Payments from these are labelled "our demo", everything else "outside account" (not proof of independent demand). */
export const isDemoAccount = (a: string) => a === CONFIG.root || a.endsWith(`.${CONFIG.root}`)
