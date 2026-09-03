import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2f6ff",
          100: "#e6edff",
          200: "#c3d3ff",
          300: "#9fb8ff",
          400: "#5c85ff",
          500: "#1a52ff",
          600: "#1745db",
          700: "#1338b3",
          800: "#0f2c8f",
          900: "#0c2170",
        },
      },
    },
  },
  plugins: [],
};

export default config;
