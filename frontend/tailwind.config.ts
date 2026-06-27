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
        sans:  ["Inter", "system-ui", "sans-serif"],
        serif: ["Playfair Display", "Georgia", "serif"],
        mono:  ["'Fira Code'", "'JetBrains Mono'", "monospace"],
      },
      colors: {
        /* Lime accent */
        lime: {
          DEFAULT: "#C8F31D",
          dim:     "rgba(200,243,29,0.12)",
          border:  "rgba(200,243,29,0.35)",
        },
        /* Base surfaces */
        base:    "#0A0A0A",
        panel:   "#161616",
        elevated:"#1E1E1E",
        hover:   "#222222",
        /* Hairline borders */
        hair:    "#2A2A2A",
        mid:     "#333333",
        strong:  "#444444",
        /* Text */
        primary: "#F5F5F5",
        secondary:"#9A9A9A",
        tertiary: "#555555",
      },
      borderRadius: {
        sm:  "6px",
        md:  "9px",
        lg:  "12px",
        xl:  "16px",
        "2xl": "20px",
      },
      animation: {
        "cursor-blink": "cursorBlink 1s step-end infinite",
        "lime-pulse":   "limePulse 1.4s ease-in-out infinite",
        "dot-bounce":   "dotBounce 0.8s ease-in-out infinite",
        "fade-up":      "fadeUp 0.4s cubic-bezier(0.22,1,0.36,1) both",
        "slide-left":   "slideInLeft 0.3s cubic-bezier(0.22,1,0.36,1) both",
        "shimmer":      "shimmer 1.8s infinite",
      },
      keyframes: {
        cursorBlink: {
          "0%, 100%": { opacity: "0.85" },
          "50%":      { opacity: "0"    },
        },
        limePulse: {
          "0%, 100%": { transform: "scale(1)",    opacity: "1"    },
          "50%":      { transform: "scale(1.5)",  opacity: "0.55" },
        },
        dotBounce: {
          "0%, 80%, 100%": { transform: "translateY(0)" },
          "40%":           { transform: "translateY(-5px)" },
        },
        fadeUp: {
          from: { opacity: "0", transform: "translateY(14px)" },
          to:   { opacity: "1", transform: "translateY(0)"    },
        },
        slideInLeft: {
          from: { opacity: "0", transform: "translateX(-14px)" },
          to:   { opacity: "1", transform: "translateX(0)"     },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition:  "200% 0" },
        },
      },
      boxShadow: {
        none: "none",
      },
    },
  },
  plugins: [],
};

export default config;
