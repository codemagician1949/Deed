export type DeedStatus = "serving" | "listed" | "awaiting_activation"

export type EventKind =
  | "minted"
  | "activated"
  | "job_served"
  | "earned"
  | "swept"
  | "listed"
  | "sold"
  | "permissions_cleared"
  | "proceeds_paid"
  | "royalty_paid"
  | "refund"
  | "attack_blocked"

export interface HistoryEvent {
  id: string
  kind: EventKind
  /** ISO timestamp */
  at: string
  /** Plain-language one-liner, e.g. "Paid 0.05 NEAR for a check" */
  title: string
  /** Optional extra line for curious readers */
  detail?: string
  amountNear?: number
  /** Transaction hash, links to the explorer */
  tx?: string
  /** Who did it */
  actor?: string
  /** Where a payment came from: our own demo script, or a real outside user */
  source?: "demo" | "external"
}

export interface Holder {
  account: string
  from: string
  to?: string
  earnedNear: number
}

export interface Deed {
  /** The name, which is also the account and the NFT, e.g. "preflight.bot" */
  id: string
  /** What the service does, in one plain sentence */
  tagline: string
  service: {
    title: string
    priceNear: number
    model: string
    configHash: string
  }
  owner: string
  status: DeedStatus
  listing?: { priceNear: number; nonce: string; seller: string }
  stats: {
    earnedNear: number
    jobs: number
    refunds: number
    uptimePct: number
  }
  /** Daily earnings, oldest first */
  earningsSeries: number[]
  holders: Holder[]
  history: HistoryEvent[]
  leaseUntil: string
  hue: number
}

export type ProofStatus = "proven_sandbox" | "proven_testnet" | "planned"

export interface Attack {
  id: string
  /** What the old owner tries, in plain words */
  attempt: string
  /** What stops it, in plain words */
  stoppedBy: string
  /** The exact on-chain error a developer would see */
  error: string
  /** Threat model row */
  row: string
  status: ProofStatus
}
