import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

/**
 * Wallet state. Real NEAR wallet connection (NEAR Connect) is wired in with the
 * testnet deployment. Until then the only option is an explicit, labelled
 * "preview as" mode, so the gated pages can be explored. It never signs anything.
 */
interface WalletState {
  account: string | null
  /** true when the account is a labelled preview, not a connected wallet */
  preview: boolean
  previewAs: (account: string) => void
  disconnect: () => void
}

const Ctx = createContext<WalletState | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const value = useMemo<WalletState>(
    () => ({
      account,
      preview,
      previewAs: (a) => {
        setAccount(a)
        setPreview(true)
      },
      disconnect: () => {
        setAccount(null)
        setPreview(false)
      },
    }),
    [account, preview],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWallet() {
  const v = useContext(Ctx)
  if (!v) throw new Error("useWallet must be used inside <WalletProvider>")
  return v
}
