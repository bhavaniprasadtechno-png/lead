"use client";

import { useEffect, useRef, useState, type ReactNode, type CSSProperties, type MouseEvent } from "react";
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence, animate, type Variants } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Fades + rises an element into place. Used to give every page's key sections a soft entrance instead of popping in. */
export function FadeIn({
  children,
  delay = 0,
  y = 12,
  className,
  style,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

/** Container/item pair for staggered list & grid entrances (stat rows, table rows, card grids). */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={staggerContainer} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={staggerItem}>
      {children}
    </motion.div>
  );
}

/**
 * Wraps a card in a mouse-tracked 3D tilt + specular highlight, the way a
 * premium product surface (Linear, Stripe dashboards) reacts to the cursor
 * instead of sitting flat. Falls back to a plain hover lift on touch
 * devices, where there's no persistent cursor position to track.
 */
export function TiltCard({
  children,
  className = "",
  maxTilt = 8,
}: {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [glow, setGlow] = useState({ x: 50, y: 50, active: false });

  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 300, damping: 24 });
  const springY = useSpring(rotateY, { stiffness: 300, damping: 24 });
  const lift = useTransform([springX, springY], ([rx, ry]: number[]) =>
    Math.max(Math.abs(rx), Math.abs(ry)) > 0.5 ? -4 : 0
  );

  function onMouseMove(e: MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    rotateY.set((px - 0.5) * maxTilt * 2);
    rotateX.set((0.5 - py) * maxTilt * 2);
    setGlow({ x: px * 100, y: py * 100, active: true });
  }

  function onMouseLeave() {
    rotateX.set(0);
    rotateY.set(0);
    setGlow((g) => ({ ...g, active: false }));
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ rotateX: springX, rotateY: springY, translateZ: 0, y: lift, transformPerspective: 900 }}
      className={`relative ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300"
        style={{
          opacity: glow.active ? 1 : 0,
          background: `radial-gradient(220px circle at ${glow.x}% ${glow.y}%, rgba(26,82,255,0.10), transparent 60%)`,
        }}
      />
      {children}
    </motion.div>
  );
}

/** Animates a numeric stat counting up from 0 on mount instead of appearing as static text. */
export function AnimatedNumber({ value, duration = 0.8 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    const controls = animate(0, value, {
      duration,
      ease: EASE,
      onUpdate: (v) => setDisplay(Math.round(v).toLocaleString()),
    });
    return () => controls.stop();
  }, [value, duration]);

  return <>{display}</>;
}

/**
 * Entrance for anything that overlays the page — modals, drawers. Callers
 * mount/unmount this from outside (`{open && <Modal ...>}`), so there's no
 * persistent parent to animate an exit against; this covers the mount
 * transition, which is what actually plays under that pattern.
 */
export function ModalTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 px-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.28, ease: EASE }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

export { motion, AnimatePresence };
