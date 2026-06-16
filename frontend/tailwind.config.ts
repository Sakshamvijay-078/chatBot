import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      colors: {
        // Core brand palette
        penda: {
          50:  "#f5f3ff",
          100: "#ede9fe",
          200: "#ddd6fe",
          300: "#c4b5fd",
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
          700: "#6d28d9",
          800: "#5b21b6",
          900: "#4c1d95",
          950: "#2e1065",
        },
        zinc: {
          950: "#09090b",
        },
      },
      backgroundImage: {
        "penda-gradient": "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
        "mesh-gradient":
          "radial-gradient(at 40% 20%, hsla(265,80%,30%,0.3) 0, transparent 50%), radial-gradient(at 80% 80%, hsla(240,70%,25%,0.25) 0, transparent 50%)",
      },
      animation: {
        "cursor-blink": "blink 1s step-end infinite",
        "slide-in-left": "slideInLeft 0.3s ease-out",
        "fade-up": "fadeUp 0.4s ease-out",
        "shimmer": "shimmer 1.5s infinite",
        "pulse-slow": "pulse 3s ease-in-out infinite",
      },
      keyframes: {
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        slideInLeft: {
          from: { opacity: "0", transform: "translateX(-16px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        fadeUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      boxShadow: {
        "glow-violet": "0 0 24px -4px rgba(124, 58, 237, 0.5)",
        "glow-sm": "0 0 12px -2px rgba(124, 58, 237, 0.35)",
        "glass": "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};

export default config;
