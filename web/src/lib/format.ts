export const near = (n: number, digits = 2) =>
  `${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits })} NEAR`

export const shortAccount = (a: string) => (a.length > 22 ? `${a.slice(0, 10)}…${a.slice(-8)}` : a)

export const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

export const dateOnly = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

export const NETWORK = (import.meta.env.VITE_NEAR_NETWORK as string | undefined) ?? "testnet"
export const explorerTx = (hash: string) => `https://${NETWORK === "mainnet" ? "" : "testnet."}nearblocks.io/txns/${hash}`
