/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["selector", '[zaui-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Be Vietnam Pro"', "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        pharma: {
          50: "#EEF0FD",
          100: "#DDE1FA",
          200: "#C5CAFA",
          300: "#9AA0E6",
          400: "#6E72CC",
          500: "#4f52b5",
          600: "#3E4095",
          700: "#31337A",
          800: "#282A6E",
          900: "#1E2059",
        },
        surface: {
          bg: "#F3F5FB",
          card: "#FAFBFF",
          border: "#DCE1F0",
        },
        ink: {
          primary: "#121833",
          secondary: "#3E486B",
          muted: "#5A658A",
        },
      },
    },
  },
};
