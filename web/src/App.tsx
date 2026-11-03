import { useEffect } from "react"
import { Link, Route, Routes, useLocation } from "react-router-dom"
import { AnimatePresence, MotionConfig, motion, useScroll, useSpring } from "motion/react"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SealLogo } from "@/components/bits"
import { SiteHeader } from "@/components/site-header"
import { WalletProvider } from "@/lib/wallet"
import { NETWORK } from "@/lib/format"
import { HomePage } from "@/pages/home"
import { MarketPage } from "@/pages/market"
import { DeedPage } from "@/pages/deed"
import { ProofPage } from "@/pages/proof"
import { HowPage } from "@/pages/how"
import { ConsolePage } from "@/pages/console"
import { TryPage } from "@/pages/try"

function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30 })
  return <motion.div aria-hidden className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-primary" style={{ scaleX }} />
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  return null
}

export default function App() {
  const location = useLocation()
  return (
    <MotionConfig reducedMotion="user">
      <WalletProvider>
        <TooltipProvider>
          <div className="min-h-svh overflow-x-clip bg-background text-foreground">
            <ScrollProgress />
            <ScrollToTop />
            <SiteHeader />
            <AnimatePresence mode="wait">
              <Routes location={location} key={location.pathname}>
                <Route path="/" element={<HomePage />} />
                <Route path="/market" element={<MarketPage />} />
                <Route path="/deed/:id" element={<DeedPage />} />
                <Route path="/proof" element={<ProofPage />} />
                <Route path="/how" element={<HowPage />} />
                <Route path="/console" element={<ConsolePage />} />
                <Route path="/try" element={<TryPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AnimatePresence>
            <Footer />
            <Toaster position="bottom-center" />
          </div>
        </TooltipProvider>
      </WalletProvider>
    </MotionConfig>
  )
}

function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-32 text-center">
      <h1 className="font-heading text-6xl">Nothing here</h1>
      <p className="mt-3 text-muted-foreground">That page doesn't exist.</p>
      <Link to="/" className="mt-6 inline-block underline underline-offset-4">
        Go home
      </Link>
    </main>
  )
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:px-6">
        <div className="flex items-center gap-2">
          <SealLogo className="size-6" />
          <span>Deed · NFTs that do something</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs">
            <span className="size-1.5 rounded-full bg-success" /> NEAR {NETWORK}
          </span>
          <Link to="/proof" className="hover:text-foreground">
            Safety proof
          </Link>
          <Link to="/how" className="hover:text-foreground">
            How it works
          </Link>
        </div>
      </div>
    </footer>
  )
}
