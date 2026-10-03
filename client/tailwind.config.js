const defaultTheme = require("tailwindcss/defaultTheme");
const colors = require("tailwindcss/colors");
const flattenColorPalette =
  require("tailwindcss/lib/util/flattenColorPalette").default;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        input: `0px 2px 3px -1px rgba(0,0,0,0.1), 0px 1px 0px 0px rgba(25,28,33,0.02), 0px 0px 0px 1px rgba(25,28,33,0.08)`,
      },
      colors: {
        'primary': {
          '50': '#eafeff',
          '100': '#cbfbff',
          '200': '#9ef4ff',
          '300': '#5be9ff',
          '400': '#00d1ff',
          '500': '#00b7e5',
          '600': '#0091c0',
          '700': '#03739b',
          '800': '#0d5d7d',
          '900': '#104d69',
          '950': '#033249',
        },
        "custom-gray": "#1e1e1e",
        "custom-blue": "#00adf0",
        "border-blue": "#00d1ff",
        "border-dotted": "#00d1ff",
        "dark-blue": "#010a13",
        "deep-blue": {
          lighter: "rgba(10, 23, 29, 0.22)",
          DEFAULT: "rgba(12, 27, 46, 0.61)",
          darker: "rgba(0, 76, 94, 0.04)",
        },
        "cyan-process": "#00c3ff",
      },

      fontFamily: {
        aldrich: ["Aldrich", "sans-serif"],
        almarai: ["Almarai", "sans-serif"],
        anek: ["Anek Latin", "sans-serif"],
        sans: ["Aldrich", "sans-serif"],
        "bebas-neue": ['"Bebas Neue"', "sans-serif"],
        chakra: ['"Chakra Petch"', "sans-serif"],
        'default-sans': defaultTheme.fontFamily.sans,
      },
      transitionDuration: {
        500: "500ms",
      },
      animation: {
        shimmer: "shimmer 2s linear infinite",
      },
      keyframes: {
        shimmer: {
          from: {
            backgroundPosition: "0 0",
          },
          to: {
            backgroundPosition: "-200% 0",
          },
        },
      },
    },
  },
  plugins: [
    addVariablesForColors,
    function ({ addUtilities }) {
      addUtilities({
        ".border-dotted-custom": {
          borderStyle: "dotted",
        },
      });
    },
  ],
};

function addVariablesForColors({ addBase, theme }) {
  let allColors = flattenColorPalette(theme("colors"));
  let newVars = Object.fromEntries(
    Object.entries(allColors).map(([key, val]) => [`--${key}`, val])
  );

  addBase({
    ":root": newVars,
  });
}