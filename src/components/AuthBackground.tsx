"use client";

import { motion } from "framer-motion";

/** Slow-drifting gradient blobs behind the login/register card — the one place a fully decorative animation earns its place, since there's no content competing with it. */
export function AuthBackground() {
  return (
    <div className="absolute inset-0 -z-10 pointer-events-none">
      <motion.div
        className="absolute -top-32 -left-24 w-96 h-96 rounded-full bg-brand-300/40 blur-3xl"
        animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-1/3 -right-24 w-96 h-96 rounded-full bg-accent-400/30 blur-3xl"
        animate={{ x: [0, -24, 0], y: [0, -16, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-24 left-1/3 w-80 h-80 rounded-full bg-brand-200/35 blur-3xl"
        animate={{ x: [0, 20, 0], y: [0, -20, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
