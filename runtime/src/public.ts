import type { Job } from "./jobs"
import { sha256Hex } from "./tee"

/**
 * Public view of a job: enough to verify the track record (outcome, verdict, flag codes, the enclave
 * signature checks and the hashes they cover, the on-chain settlement) without exposing the customer's
 * transaction or the explanation of it. The payer and the holder see the full job.
 */
export function publicJob(j: Job) {
  const a = j.answer
  return {
    id: j.id,
    escrowJobId: j.escrowJobId,
    name: j.name,
    payer: j.payer,
    amountYocto: j.amountYocto,
    paidAtNs: j.paidAtNs,
    status: j.status,
    eraOwner: j.eraOwner,
    activationVersion: j.activationVersion,
    ownerAtDelivery: j.ownerAtDelivery,
    flags: j.flags.map((f) => ({ code: f.code, severity: f.severity })),
    verdict: j.verdict,
    settlement: j.settlement,
    refundTx: j.refundTx,
    reason: j.reason,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
    redacted: true,
    answer: a && {
      model: a.model,
      chatId: a.chatId,
      requestSha256: sha256Hex(a.requestBody),
      responseSha256: sha256Hex(a.responseBody),
      signature: a.signature,
      check: a.check,
    },
  }
}
