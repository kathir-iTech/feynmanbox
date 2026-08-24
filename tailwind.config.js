/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      animation: {
        "wave": "wave 1.2s ease-in-out infinite",
        "progress-bar": "progress-bar 1.5s ease-in-out infinite",
        "shake": "shake 0.5s ease-in-out",
        "fade-in": "fadeIn 0.5s ease-out forwards",
        "count-up": "countUp 1s ease-out forwards",
        "pulse-red": "pulseRed 0.6s ease-in-out 3",
        "slide-in": "slideIn 0.3s ease-out forwards",
      },
      keyframes: {
        wave: {
          "0%, 100%": { height: "4px" },
          "50%": { height: "24px" },
        },
        "progress-bar": {
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
        countUp: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        pulseRed: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(239, 68, 68, 0)" },
          "50%": { boxShadow: "0 0 20px 4px rgba(239, 68, 68, 0.4)" },
        },
        slideIn: {
          "0%": { opacity: "0", transform: "translateX(-8px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
    },
  },
  plugins: [],
}
