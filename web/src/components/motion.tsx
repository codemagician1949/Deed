import { useEffect, useRef, type ReactNode } from "react"
import {
  animate,
  motion,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type HTMLMotionProps,
} from "motion/react"
import { cn } from "@/lib/utils"

export const ease = [0.22, 1, 0.36, 1] as const

/** Fades and lifts children into view once. */
export function Reveal({
  children,
  delay = 0,
  y = 18,
  className,
  ...rest
}: { children: ReactNode; delay?: number; y?: number } & HTMLMotionProps<"div">) {
  return (
    <motion.div
      initial={{ opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay, ease }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

/** Staggers its direct <StaggerItem> children. */
export function Stagger({ children, className, gap = 0.08 }: { children: ReactNode; className?: string; gap?: number }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 16, scale: 0.98 },
        show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.55, ease } },
      }}
    >
      {children}
    </motion.div>
  )
}

/** Counts up to `value` when it scrolls into view, and springs to new values after. */
export function AnimatedNumber({
  value,
  decimals = 0,
  suffix = "",
  className,
}: {
  value: number
  decimals?: number
  suffix?: string
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduce = useReducedMotion()
  useEffect(() => {
    const node = ref.current
    if (!node || !inView) return
    const fmt = (v: number) =>
      v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix
    if (reduce) {
      node.textContent = fmt(value)
      return
    }
    const from = Number(node.dataset.v ?? 0)
    const controls = animate(from, value, {
      duration: 1.4,
      ease,
      onUpdate: (v) => {
        node.textContent = fmt(v)
        node.dataset.v = String(v)
      },
    })
    return () => controls.stop()
  }, [inView, value, decimals, suffix, reduce])
  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {(0).toFixed(decimals) + suffix}
    </span>
  )
}

/** 3D tilt + moving light that follows the pointer. */
export function Tilt({ children, className, max = 10 }: { children: ReactNode; className?: string; max?: number }) {
  const reduce = useReducedMotion()
  const x = useMotionValue(0.5)
  const y = useMotionValue(0.5)
  const sx = useSpring(x, { stiffness: 160, damping: 18 })
  const sy = useSpring(y, { stiffness: 160, damping: 18 })
  const rotateY = useTransform(sx, [0, 1], [-max, max])
  const rotateX = useTransform(sy, [0, 1], [max, -max])
  const lx = useTransform(sx, (v) => `${v * 100}%`)
  const ly = useTransform(sy, (v) => `${v * 100}%`)
  const light = useMotionTemplate`radial-gradient(420px circle at ${lx} ${ly}, rgb(255 255 255 / 0.16), transparent 45%)`
  return (
    <motion.div
      className={cn("relative [transform-style:preserve-3d]", className)}
      style={reduce ? undefined : { rotateX, rotateY, transformPerspective: 1000 }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        x.set((e.clientX - r.left) / r.width)
        y.set((e.clientY - r.top) / r.height)
      }}
      onPointerLeave={() => {
        x.set(0.5)
        y.set(0.5)
      }}
    >
      {children}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] mix-blend-overlay"
        style={{ background: light }}
      />
    </motion.div>
  )
}

/** Page wrapper with an enter/exit transition. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.45, ease }}
      className={cn("relative", className)}
    >
      {children}
    </motion.main>
  )
}
