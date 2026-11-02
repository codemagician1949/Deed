// SAMPLE DATA, shown only until the testnet contracts are deployed.
// Every screen that uses it shows the "Sample data" badge. Nothing here is a real transaction.
import type { Attack, Deed, HistoryEvent } from "./types"

const day = (n: number, h = 12) => {
  const d = new Date(Date.UTC(2026, 9, 20 + n, h, 0, 0))
  return d.toISOString()
}

function jobs(start: number, count: number, owner: string, price: number): HistoryEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `job-${owner}-${start + i}`,
    kind: "job_served" as const,
    at: day(start + Math.floor(i / 2), 9 + (i % 2) * 6),
    title: `Checked a transaction for a paying agent`,
    detail: "Answer signed inside a secure enclave (TEE)",
    amountNear: price,
    actor: i % 3 === 0 ? "agent-7.testnet" : "builder-wallet.testnet",
    source: i % 4 === 0 ? ("demo" as const) : ("external" as const),
  }))
}

export const SAMPLE_DEEDS: Deed[] = [
  {
    id: "preflight.bot",
    tagline: "Explains a NEAR transaction in plain words and flags anything risky, before you sign it.",
    service: {
      title: "Preflight",
      priceNear: 0.05,
      model: "z-ai/glm-5.3 (verifiable)",
      configHash: "3f79bb7b435b05321651daefd374cdc681dc06faa65e374e38337b88ca046dea",
    },
    owner: "maya.testnet",
    status: "serving",
    stats: { earnedNear: 18.45, jobs: 369, refunds: 2, uptimePct: 99.6 },
    earningsSeries: [0.4, 0.6, 0.55, 0.9, 1.1, 0.8, 1.3, 1.6, 1.2, 1.9, 2.1, 1.8, 2.4, 2.7],
    holders: [
      { account: "kofi.testnet", from: day(0), to: day(6), earnedNear: 4.2 },
      { account: "maya.testnet", from: day(6), earnedNear: 14.25 },
    ],
    history: [
      ...jobs(9, 4, "maya", 0.05).reverse(),
      { id: "a2", kind: "activated", at: day(6, 15), title: "Maya switched the service on", detail: "Version 2 · same public config", actor: "maya.testnet" },
      { id: "atk", kind: "attack_blocked", at: day(6, 14), title: "Kofi's old agent tried to spend: blocked", detail: "Its permission was wiped by the sale", actor: "kofi-agent.testnet" },
      { id: "pay", kind: "proceeds_paid", at: day(6, 14), title: "Kofi was paid for the sale", amountNear: 39, actor: "kofi.testnet" },
      { id: "roy", kind: "royalty_paid", at: day(6, 14), title: "Template creator royalty", amountNear: 1, actor: "deed-creator.testnet" },
      { id: "clr", kind: "permissions_cleared", at: day(6, 13), title: "All of Kofi's permissions were wiped", detail: "Done by the account's own wallet code, not by us" },
      { id: "sold", kind: "sold", at: day(6, 13), title: "Sold to Maya for 40 NEAR", amountNear: 40, actor: "maya.testnet" },
      { id: "swp", kind: "swept", at: day(5, 18), title: "Kofi's earnings paid out to Kofi", amountNear: 4.2, actor: "kofi.testnet" },
      { id: "lst", kind: "listed", at: day(5, 18), title: "Kofi listed it for 40 NEAR", actor: "kofi.testnet" },
      ...jobs(1, 3, "kofi", 0.05).reverse(),
      { id: "a1", kind: "activated", at: day(0, 13), title: "Kofi switched the service on", actor: "kofi.testnet" },
      { id: "m", kind: "minted", at: day(0, 12), title: "Name claimed by Kofi", actor: "kofi.testnet" },
    ],
    leaseUntil: "2027-10-20",
    hue: 75,
  },
  {
    id: "contractlens.agi",
    tagline: "Reads any NEAR smart contract and tells you, in one paragraph, what it can do with your money.",
    service: {
      title: "Contract Lens",
      priceNear: 0.12,
      model: "moonshotai/kimi-k3 (verifiable)",
      configHash: "9a0364b9e99bb480dd25e1f0284c8555b14a6c0f6f6d6f8b2c3c2c5f8e1a7b21",
    },
    owner: "deed-escrow.testnet",
    status: "listed",
    listing: { priceNear: 65, nonce: "14", seller: "ade.testnet" },
    stats: { earnedNear: 31.2, jobs: 260, refunds: 4, uptimePct: 98.9 },
    earningsSeries: [1.2, 1.4, 1.1, 1.9, 2.2, 2.0, 2.6, 2.4, 2.9, 2.5, 3.1, 2.8, 3.0, 2.1],
    holders: [{ account: "ade.testnet", from: day(0), earnedNear: 31.2 }],
    history: [
      { id: "lst2", kind: "listed", at: day(12, 10), title: "Ade listed it for 65 NEAR", detail: "Service pauses until a buyer switches it on", actor: "ade.testnet" },
      { id: "swp2", kind: "swept", at: day(12, 10), title: "Ade's earnings paid out to Ade", amountNear: 31.2, actor: "ade.testnet" },
      ...jobs(2, 5, "ade", 0.12).reverse(),
      { id: "a3", kind: "activated", at: day(0, 11), title: "Ade switched the service on", actor: "ade.testnet" },
      { id: "m2", kind: "minted", at: day(0, 10), title: "Name claimed by Ade", actor: "ade.testnet" },
    ],
    leaseUntil: "2027-10-20",
    hue: 245,
  },
  {
    id: "gasguide.assistant",
    tagline: "Tells you how much gas a transaction really needs and why it failed, if it did.",
    service: {
      title: "Gas Guide",
      priceNear: 0.02,
      model: "z-ai/glm-5.3-flash (verifiable)",
      configHash: "c1f2a7d55e2b0e5f1b1a5a6b1d9e4f3a2c7b6d5e4f3a2b1c0d9e8f7a6b5c4d3e",
    },
    owner: "tolu.testnet",
    status: "awaiting_activation",
    stats: { earnedNear: 6.1, jobs: 305, refunds: 0, uptimePct: 99.9 },
    earningsSeries: [0.3, 0.35, 0.4, 0.5, 0.45, 0.6, 0.5, 0.4, 0.55, 0.5, 0.45, 0.5, 0.35, 0],
    holders: [
      { account: "sam.testnet", from: day(0), to: day(13), earnedNear: 6.1 },
      { account: "tolu.testnet", from: day(13) },
    ].map((h) => ({ earnedNear: 0, ...h })),
    history: [
      { id: "sold3", kind: "sold", at: day(13, 9), title: "Sold to Tolu for 12 NEAR", detail: "Waiting for Tolu to switch the service on", amountNear: 12, actor: "tolu.testnet" },
      { id: "clr3", kind: "permissions_cleared", at: day(13, 9), title: "All of Sam's permissions were wiped" },
      { id: "m3", kind: "minted", at: day(0, 8), title: "Name claimed by Sam", actor: "sam.testnet" },
    ],
    leaseUntil: "2027-10-20",
    hue: 160,
  },
]

export const ATTACKS: Attack[] = [
  { id: "A1", attempt: "The old owner's AI agent tries to spend from the account", stoppedBy: "The sale wipes every agent permission. The account's own wallet code does this, not us.", error: "spend refused by the wallet", row: "A1", status: "proven_sandbox" },
  { id: "A2", attempt: "The old owner hid a second \"co-owner\" key before selling", stoppedBy: "The same wipe removes every extra key. Only the new owner remains.", error: "co-owner removed by the wallet", row: "A2", status: "proven_sandbox" },
  { id: "A3", attempt: "The old owner gives themselves a new permission", stoppedBy: "Only the current owner can hand out permissions.", error: "UNAUTHORIZED", row: "A3", status: "proven_sandbox" },
  { id: "A4", attempt: "The old owner tries to sign in as the name", stoppedBy: "Sign-in only works for someone the account lists as an owner.", error: "NOT_AN_OWNER", row: "A4", status: "proven_sandbox" },
  { id: "A6", attempt: "The old owner tries to sell the name a second time", stoppedBy: "The registry only lets the current owner move it.", error: "OnlyOwner", row: "A6", status: "proven_sandbox" },
  { id: "D2", attempt: "The old owner switches the service back on", stoppedBy: "Deed checks the registry for the current owner, live, every time.", error: "only the current owner of the name can activate it", row: "D2", status: "proven_sandbox" },
  { id: "B3", attempt: "Payments made while it's for sale go missing", stoppedBy: "The escrow points earnings back at the seller the moment it's listed.", error: "—", row: "B3", status: "proven_sandbox" },
  { id: "C1", attempt: "The buyer pays but the name never arrives", stoppedBy: "If the transfer fails, the buyer gets every coin back in the same step.", error: "sale_failed_refunded", row: "C1", status: "proven_sandbox" },
  { id: "C2", attempt: "Someone pays less than the asking price", stoppedBy: "The escrow only accepts the exact price.", error: "attach exactly the listed price", row: "C2", status: "proven_sandbox" },
  { id: "C4", attempt: "The seller changes the price while you're paying", stoppedBy: "Your purchase is pinned to the exact listing you saw.", error: "listing changed since you looked", row: "C4", status: "proven_sandbox" },
  { id: "C5", attempt: "The sale gets reversed after the seller is paid", stoppedBy: "The seller's money unlocks only after the 5-minute safety window.", error: "revert window still open", row: "C5", status: "proven_sandbox" },
  { id: "A7", attempt: "The old owner uses a hidden password on the account", stoppedBy: "There isn't one. The account has no keys at all; only its wallet code can act.", error: "no access keys", row: "A7", status: "proven_sandbox" },
  { id: "B4", attempt: "The seller parks tokens in the account to block the sale", stoppedBy: "The registry won't move an account holding tokens. Earnings are in NEAR only.", error: "SubAccountHoldsTokens", row: "B4", status: "proven_sandbox" },
]
