import { useEffect, useState } from "react"
import { Link, NavLink, useLocation } from "react-router-dom"
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react"
import { Menu, Moon, Sun, Wallet, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useWallet } from "@/lib/wallet"
import { SealLogo } from "./bits"
import { ConnectDialog } from "./connect-dialog"

const NAV = [
  { to: "/market", label: "Browse" },
  { to: "/how", label: "How it works" },
  { to: "/proof", label: "Safety proof" },
  { to: "/console", label: "My Deeds" },
]

export function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem("deed-theme")
      if (saved) return saved === "dark"
    } catch {
      /* storage blocked */
    }
    return true
  })
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    try {
      localStorage.setItem("deed-theme", dark ? "dark" : "light")
    } catch {
      /* storage blocked */
    }
  }, [dark])
  return [dark, setDark] as const
}

export function SiteHeader() {
  const [dark, setDark] = useTheme()
  const { scrollY } = useScroll()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const { account, preview, disconnect } = useWallet()
  const { pathname } = useLocation()
  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 12))
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <header className="sticky top-0 z-40">
      <motion.div
        className={cn(
          "mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 transition-[padding] duration-300 sm:px-6",
          scrolled ? "py-2" : "py-4",
        )}
      >
        <motion.div
          layout
          className={cn(
            "flex w-full items-center justify-between gap-4 rounded-2xl px-3 py-2 transition-all duration-500",
            scrolled && "border border-border bg-background/70 shadow-lg shadow-black/10 backdrop-blur-xl",
          )}
        >
          <Link to="/" className="flex items-center gap-2.5">
            <SealLogo />
            <span className="font-heading text-2xl tracking-tight">Deed</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className="relative rounded-full px-3.5 py-1.5 text-sm">
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-full bg-muted"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      />
                    )}
                    <span className={cn("relative", isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                      {n.label}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Toggle dark mode" onClick={() => setDark(!dark)}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={dark ? "moon" : "sun"}
                  initial={{ rotate: -90, scale: 0.5, opacity: 0 }}
                  animate={{ rotate: 0, scale: 1, opacity: 1 }}
                  exit={{ rotate: 90, scale: 0.5, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  {dark ? <Moon /> : <Sun />}
                </motion.span>
              </AnimatePresence>
            </Button>
            {account ? (
              <Button variant="outline" className="hidden rounded-full sm:inline-flex" onClick={disconnect}>
                <span className="size-2 rounded-full bg-success" />
                <span className="max-w-36 truncate font-mono text-xs">{account}</span>
                {preview && <span className="text-[10px] text-muted-foreground">preview</span>}
              </Button>
            ) : (
              <Button className="hidden rounded-full sm:inline-flex" onClick={() => setConnectOpen(true)}>
                <Wallet /> Connect
              </Button>
            )}
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu" onClick={() => setOpen(!open)}>
              {open ? <X /> : <Menu />}
            </Button>
          </div>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-4 rounded-2xl border border-border bg-background/95 p-2 shadow-xl backdrop-blur-xl md:hidden"
          >
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className="block rounded-xl px-4 py-3 text-sm hover:bg-muted">
                {n.label}
              </NavLink>
            ))}
            {!account && (
              <Button className="mt-2 w-full rounded-xl" onClick={() => setConnectOpen(true)}>
                <Wallet /> Connect
              </Button>
            )}
          </motion.nav>
        )}
      </AnimatePresence>
      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </header>
  )
}
