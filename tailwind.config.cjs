/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        indigo: {
          100: "#e3f2fd",
          200: "#bbdefb",
          300: "#90caf9",
          400: "#64b5f6",
          500: "#1976d2",
          600: "#1565c0",
          700: "#0d47a1",
          800: "#0b3d91",
          900: "#0a2c66",
        },
        slate: {
          100: "#f8f9fa",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#1e293b",
          800: "#0f172a",
          900: "#020617",
        },
      },
    },
  },
  plugins: [],
}