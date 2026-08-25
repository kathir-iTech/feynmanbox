/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0F1419",
          light: "#1A2129",
          border: "#2A333D",
        },
        parchment: {
          DEFAULT: "#F0EBE0",
          muted: "#8B93A0",
        },
        brass: {
          DEFAULT: "#C9962C",
          dark: "#A67A1F",
          light: "#D4A94D",
        },
        verified: "#5A9B6F",
        flagged: "#C4453D",
      },
      fontFamily: {
        serif: ['"Fraunces"', "Georgia", "serif"],
        sans: ['"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        panel: "4px",
      },
      animation: {
        "progress-bar": "progressBar 1.5s ease-in-out infinite",
        "shake": "shake 0.5s ease-in-out",
        "fade-in": "fadeIn 0.5s ease-out forwards",
        "pulse-red": "pulseRed 0.6s ease-in-out 3",
      },
      keyframes: {
        progressBar: {
          "0%": { transform: "translateX(-100%)" },
          "50%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(100%)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "10%, 30%, 50%, 70%, 90%": { transform: "translateX(-4px)" },
          "20%, 40%, 60%, 80%": { transform: "translateX(4px)" },
        },
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseRed: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(196, 69, 61, 0)" },
          "50%": { boxShadow: "0 0 20px 4px rgba(196, 69, 61, 0.4)" },
        },
      },
    },
  },
  plugins: [],
}
