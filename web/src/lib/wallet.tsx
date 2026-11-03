import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { NearConnector as NearConnectorT } from "@hot-labs/near-connect"
import { TGAS } from "./near"

/**
 * Wallet state, backed by NEAR Connect (testnet). Wallets run in sandboxed iframes; nothing is
 * signed without the user approving it in their wallet.
 *
 * "Preview as" lets a reviewer without a testnet wallet look at the owner console for any account.
 * It is read-only and clearly labelled: it can't sign or send anything.
 */
export interface CallParams {
  receiverId: string
  method: string
  args: object
  depositYocto?: string
  tgas?: number
}

interface WalletState {
  account: string | null
  preview: boolean
  ready: boolean
  connect: () => Promise<void>
  previewAs: (account: string) => void
  disconnect: () => Promise<void>
  /** Sends one function call and returns the transaction hash. */
  call: (p: CallParams) => Promise<string>
  /** Sends NEAR to an account and returns the transaction hash. */
  transfer: (receiverId: string, yocto: string) => Promise<string>
}

const Ctx = createContext<WalletState | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [ready, setReady] = useState(false)
  const connectorRef = useRef<NearConnectorT | null>(null)

  useEffect(() => {
    let cancelled = false
    // Loaded lazily so the wallet code stays out of the first paint.
    import("@hot-labs/near-connect").then(async ({ NearConnector }) => {
      if (cancelled) return
      const c = new NearConnector({ network: "testnet", features: { testnet: true, signAndSendTransaction: true } })
      connectorRef.current = c
      c.on("wallet:signIn", (t) => {
        setAccount(t.accounts[0]?.accountId ?? null)
        setPreview(false)
      })
      c.on("wallet:signOut", () => setAccount(null))
      try {
        const { accounts } = await c.getConnectedWallet()
        if (!cancelled && accounts[0]) setAccount(accounts[0].accountId)
      } catch {
        /* not connected yet */
      }
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const connect = useCallback(async () => {
    const c = connectorRef.current
    if (!c) throw new Error("Wallet library is still loading. Try again in a second.")
    await c.connect()
  }, [])

  const disconnect = useCallback(async () => {
    if (preview) {
      setAccount(null)
      setPreview(false)
      return
    }
    await connectorRef.current?.disconnect().catch(() => undefined)
    setAccount(null)
  }, [preview])

  const call = useCallback(
    async ({ receiverId, method, args, depositYocto = "0", tgas = 100 }: CallParams) => {
      if (preview) throw new Error("Preview mode can't sign. Connect a NEAR testnet wallet to do this.")
      const c = connectorRef.current
      if (!c || !account) throw new Error("Connect a NEAR testnet wallet first.")
      const wallet = await c.wallet()
      const out = await wallet.signAndSendTransaction({
        signerId: account,
        receiverId,
        actions: [{ type: "FunctionCall", params: { methodName: method, args, gas: TGAS(tgas), deposit: depositYocto } }],
      } as never)
      const status = JSON.stringify((out as { status?: unknown })?.status ?? {})
      const hash = (out as { transaction?: { hash?: string } })?.transaction?.hash ?? ""
      if (status.includes("Failure")) {
        const m = status.match(/panicked: ([^"\\]+)/)
        throw Object.assign(new Error(m ? m[1] : "The transaction failed on chain."), { hash })
      }
      return hash
    },
    [account, preview],
  )

  const transfer = useCallback(
    async (receiverId: string, yocto: string) => {
      if (preview) throw new Error("Preview mode can't sign. Connect a NEAR testnet wallet to pay.")
      const c = connectorRef.current
      if (!c || !account) throw new Error("Connect a NEAR testnet wallet first.")
      const wallet = await c.wallet()
      const out = await wallet.signAndSendTransaction({
        signerId: account,
        receiverId,
        actions: [{ type: "Transfer", params: { deposit: yocto } }],
      } as never)
      const hash = (out as { transaction?: { hash?: string } })?.transaction?.hash ?? ""
      if (JSON.stringify((out as { status?: unknown })?.status ?? {}).includes("Failure")) throw new Error("The payment failed on chain.")
      return hash
    },
    [account, preview],
  )

  const value = useMemo<WalletState>(
    () => ({
      account,
      preview,
      ready,
      connect,
      disconnect,
      call,
      transfer,
      previewAs: (a) => {
        setAccount(a)
        setPreview(true)
      },
    }),
    [account, preview, ready, connect, disconnect, call, transfer],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWallet() {
  const v = useContext(Ctx)
  if (!v) throw new Error("useWallet must be used inside <WalletProvider>")
  return v
}
