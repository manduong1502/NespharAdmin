/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Be Vietnam Pro"', "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
      colors: {
        pharma: {
          50: "#EEF0FD",
          100: "#E6E9FC",
          200: "#C5CAFA",
          500: "#4F52B5",
          600: "#3E4095",
          700: "#31337A",
          800: "#282A6E",
          900: "#1E2059",
        },
        sidebar: {
          DEFAULT: "#111424",
          elevated: "#1B2038",
          muted: "#8D95AE",
        },
        frame: "#F5F7FB",
        borderline: "#E8ECF4",
        ink: {
          primary: "#131726",
          secondary: "#4A536D",
          muted: "#76809C",
        },
      },
    },
  },
  plugins: [],
};
