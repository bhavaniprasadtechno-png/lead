import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Primary — a deep indigo/violet rather than a flat corporate blue,
        // closer to the accent tone premium AI/SaaS dashboards converge on
        // (Linear, Vercel, Stripe) than the original flat #1a52ff.
        brand: {
          50: "#f5f4ff",
          100: "#ece9ff",
          200: "#d9d3fe",
          300: "#bcb0fc",
          400: "#9884f8",
          500: "#7357f0",
          600: "#5e3fd9",
          700: "#4c31b3",
          800: "#3d2790",
          900: "#2f1e70",
          950: "#1c1147",
        },
        // Accent — gradient partner for brand (violet -> magenta), used
        // sparingly for CTAs, glows, and the sidebar's active state so it
        // reads as a deliberate accent rather than a second primary color.
        accent: {
          400: "#e879c9",
          500: "#d946b8",
          600: "#be2f9d",
        },
        // Dark neutrals for the sidebar shell — distinct from the slate
        // scale used in the light content area, tuned slightly cool/violet
        // so it doesn't feel like a bolted-on generic dark panel.
        ink: {
          800: "#1c1b2e",
          900: "#15141f",
          950: "#0e0d16",
        },
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #7357f0 0%, #d946b8 100%)",
        "brand-gradient-soft": "linear-gradient(135deg, rgba(115,87,240,0.12) 0%, rgba(217,70,184,0.12) 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
