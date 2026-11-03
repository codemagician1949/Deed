// The attack list shown on /proof. Status reflects where a passing check exists:
// "proven_testnet" = verify/testnet-sale.sh on NEAR testnet (see the live report on the same page),
// "proven_sandbox" = contract/deed/tests (mainnet House of Stake bytecode or the mock registry).
import type { Attack } from "./types"

export const ATTACKS: Attack[] = [
  { id: "A1", attempt: "The old owner's AI agent tries to spend from the account", stoppedBy: "The sale wipes every agent permission. The account's own audited wallet code does this, not us.", error: "extension '…-agent' is not enabled", row: "A1", status: "proven_testnet" },
  { id: "A2", attempt: "The old owner hid a second \"co-owner\" key before selling", stoppedBy: "The same wipe removes every extra key. Only the new owner remains.", error: "extension '…-partner' is not enabled", row: "A2", status: "proven_testnet" },
  { id: "A2b", attempt: "The old owner tries to move money themselves", stoppedBy: "They are no longer on the account's list of people who can act.", error: "extension '…' is not enabled", row: "A2", status: "proven_testnet" },
  { id: "A3", attempt: "The old owner gives their agent a new permission", stoppedBy: "Only the current owner can hand out permissions.", error: "only the owner may perform this operation", row: "A3", status: "proven_testnet" },
  { id: "A4", attempt: "The old owner tries to sign in as the name", stoppedBy: "Sign-in (NEP-641) only works for someone the account lists as an owner.", error: "named account is not an owner of this account", row: "A4", status: "proven_testnet" },
  { id: "A5", attempt: "An AI agent with a spending allowance tries to sign in as the owner", stoppedBy: "Agents with an allowance can never act as an owner.", error: "a spend grantee cannot authorise as an owner", row: "A5", status: "proven_testnet" },
  { id: "A6", attempt: "The old owner tries to sell the name a second time", stoppedBy: "The registry only lets the current owner move it.", error: "{\"code\":\"only_owner\"}", row: "A6", status: "proven_testnet" },
  { id: "A7", attempt: "The old owner uses a hidden password on the account", stoppedBy: "There isn't one. The account has no keys at all; only its wallet code can act.", error: "0 access keys", row: "A7", status: "proven_testnet" },
  { id: "D2", attempt: "The old owner switches the service back on", stoppedBy: "Deed checks the registry for the current owner, live, every time.", error: "only the current owner of the name can activate it", row: "D2", status: "proven_testnet" },
  { id: "C5", attempt: "The seller grabs the money before the sale is final", stoppedBy: "The seller's money unlocks only after the 5-minute safety window.", error: "revert window still open", row: "C5", status: "proven_testnet" },
  { id: "B3", attempt: "Payments made while it's for sale go missing", stoppedBy: "Before handing the name over, the escrow points payouts at the seller, so that money reaches them.", error: "—", row: "B3", status: "proven_testnet" },
  { id: "C7", attempt: "The buyer uses the Deed for a few minutes, then sends it back hoping for a refund", stoppedBy: "A completed sale is final: the seller is always paid, and a returned name just stays the buyer's to take back.", error: "no refund (seller paid)", row: "C7", status: "proven_sandbox" },
  { id: "D6", attempt: "Someone grabs another person's public payment and asks their own question with it", stoppedBy: "Every paid question must be signed by the account that paid, binding that payment to that exact question.", error: "not a full-access key of the payer (401)", row: "D6", status: "proven_testnet" },
  { id: "C1", attempt: "The buyer pays but the name never arrives", stoppedBy: "If the transfer fails, the buyer gets every coin back in the same step.", error: "sale_failed_refunded", row: "C1", status: "proven_sandbox" },
  { id: "C2", attempt: "Someone pays less than the asking price", stoppedBy: "The escrow only accepts the exact price.", error: "attach exactly the listed price", row: "C2", status: "proven_sandbox" },
  { id: "C4", attempt: "The seller changes the price while you're paying", stoppedBy: "Your purchase is pinned to the exact listing you saw.", error: "listing changed since you looked", row: "C4", status: "proven_sandbox" },
  { id: "B4", attempt: "The seller parks tokens in the account to block the sale", stoppedBy: "The registry won't move an account holding tokens. Earnings are in NEAR only.", error: "SubAccountHoldsTokens", row: "B4", status: "proven_sandbox" },
]
