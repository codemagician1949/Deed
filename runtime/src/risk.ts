// Deterministic risk flags for a NEAR transaction someone is about to sign.
// These run before the model, never depend on it, and are what the answer must always include.

export interface ProposedAction {
  /** near-api-js / wallet-selector style: "FunctionCall" | "Transfer" | "AddKey" | "DeleteKey" | "DeleteAccount" | "DeployContract" | "Stake" | ... */
  type: string
  params?: Record<string, unknown>
}
export interface ProposedTx {
  signer_id?: string
  receiver_id: string
  actions: ProposedAction[]
}

export type Severity = "high" | "medium" | "info"
export interface RiskFlag {
  code: string
  severity: Severity
  message: string
}

const YOCTO = 10n ** 24n
const big = (v: unknown) => {
  try {
    return BigInt(String(v ?? "0"))
  } catch {
    return 0n
  }
}
const isMax = (v: unknown) => {
  const s = String(v ?? "")
  return s.length >= 30 || s === "340282366920938463463374607431768211455" // u128::MAX
}

export function riskFlags(tx: ProposedTx): RiskFlag[] {
  const flags: RiskFlag[] = []
  const add = (code: string, severity: Severity, message: string) => flags.push({ code, severity, message })
  if (!tx || typeof tx.receiver_id !== "string" || !Array.isArray(tx.actions) || tx.actions.length === 0) {
    return [{ code: "malformed", severity: "high", message: "The transaction has no receiver or no actions. Don't sign something you can't read." }]
  }
  let total = 0n
  for (const a of tx.actions) {
    const p = a.params ?? {}
    switch (a.type) {
      case "AddKey": {
        // Read the permission's structure: a function-call key names a receiver contract.
        const ak = (p.accessKey ?? p.access_key ?? {}) as Record<string, unknown>
        const perm = ak.permission ?? ak
        const permStr = typeof perm === "string" ? perm : ""
        const fc = typeof perm === "object" && perm !== null ? ((perm as Record<string, unknown>).FunctionCall ?? perm) as Record<string, unknown> : null
        const limited = !!fc && typeof (fc.receiverId ?? fc.receiver_id) === "string"
        if (/fullaccess/i.test(permStr) || !limited) {
          add("full_access_key", "high", "Adds a FULL-ACCESS key: whoever holds it can take everything in the account.")
        } else {
          add("function_call_key", "info", `Adds a limited key that can only call ${String(fc!.receiverId ?? fc!.receiver_id)} and spend a gas allowance.`)
        }
        break
      }
      case "DeleteAccount":
        add("delete_account", "high", `Deletes the account and sends everything to ${String(p.beneficiaryId ?? p.beneficiary_id ?? "another account")}.`)
        break
      case "DeployContract":
        add("deploy_contract", "high", "Replaces the code of the account. The new code can do anything the account can.")
        break
      case "DeleteKey":
        add("delete_key", "medium", "Removes an access key. If it's your last key you can lose access.")
        break
      case "Stake":
        add("stake", "medium", "Stakes NEAR with a validator key.")
        break
      case "Transfer":
        total += big(p.deposit)
        break
      case "FunctionCall": {
        const method = String(p.methodName ?? p.method_name ?? "")
        const args = (p.args ?? {}) as Record<string, unknown>
        total += big(p.deposit)
        const to = String(args.receiver_id ?? args.spender_id ?? args.account_id ?? tx.receiver_id)
        if (/approve|allowance/i.test(method) && Object.values(args).some(isMax)) {
          add("unlimited_approval", "high", `Calls ${method} with an unlimited amount: ${to} could move all of that token.`)
        } else if (/^(ft_approve|mt_approve|increase_allowance)$/i.test(method)) {
          add("approval", "medium", `Lets ${to} spend some of your tokens later without asking again.`)
        }
        if (method === "nft_approve") add("nft_approval", "high", `Lets ${to} move this NFT at any time without asking you.`)
        if (method === "nft_revoke_all") add("nft_revoke", "info", "Removes every approval on this NFT.")
        if (/^(ft_transfer|nft_transfer|mt_transfer|mt_batch_transfer)$/.test(method)) {
          add("moves_assets", "info", `Moves tokens or NFTs out via ${method} to ${to}.`)
        }
        if (/_transfer_call$/.test(method)) {
          add("transfer_call", "medium", `Sends tokens or an NFT into ${to}, whose code then decides what happens to them (normal for swaps and marketplaces).`)
        }
        for (const v of Object.values(args)) {
          if (/^\d{28,}$/.test(String(v)) && !isMax(v)) {
            add("extreme_amount", "high", "Moves an extremely large token amount: likely your entire balance.")
            break
          }
        }
        if (/^(w_execute|execute|exec|multicall|batch)/i.test(method)) {
          add("opaque_call", "medium", `${method} runs other actions inside it. Read the inner actions before signing.`)
        }
        if (big(p.gas) >= 300n * 10n ** 12n) add("max_gas", "info", "Attaches the maximum gas. Normal for complex calls, but the call can do a lot.")
        break
      }
      default:
        add("unknown_action", "medium", `Unfamiliar action type "${a.type}".`)
    }
  }
  if (total >= 100n * YOCTO) add("large_value", "high", `Sends ${Number(total / 10n ** 21n) / 1000} NEAR in total.`)
  else if (total >= 10n * YOCTO) add("large_value", "medium", `Sends ${Number(total / 10n ** 21n) / 1000} NEAR in total. Make sure that's intended.`)
  // 1 yoctoNEAR is a security deposit many calls require, not a payment; only report >= 0.001 NEAR.
  else if (total >= 10n ** 21n) add("value", "info", `Sends ${Number(total / 10n ** 21n) / 1000} NEAR in total.`)
  // Web-domain-looking receivers (evil-site.com) are a common phishing pattern on NEAR.
  if (/\.(com|io|org|net|xyz|app|site|link|gift|claim)$/i.test(tx.receiver_id)) {
    add("domain_like_receiver", "medium", `The receiver ${tx.receiver_id} looks like a website name, not a NEAR account. Check it's the one you mean.`)
  }
  // Lookalike names: a digit swapped into a word (dep0sit, b1nance, wa11et).
  const names = [tx.receiver_id, ...tx.actions.map((a) => String(((a.params ?? {}).args as Record<string, unknown> | undefined)?.receiver_id ?? ""))]
  if (names.some((n) => /[a-z][01][a-z]/i.test(n.split(".")[0]))) {
    add("lookalike_name", "medium", "An account name swaps a digit for a letter (like dep0sit): a common impersonation trick.")
  }
  return flags
}
