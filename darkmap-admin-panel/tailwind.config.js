/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          black: '#050505',
          dark: '#0a0a0a',
          gray: '#121212',
          primary: '#00f3ff',
          secondary: '#7000ff',
          text: '#e0e0e0',
          muted: '#52525b',
          danger: '#ff003c',
          success: '#00ff9d',
          warning: '#fcee0a',
        },
      },
      fontFamily: {
        orbitron: ['Orbitron', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'neon': '0 0 10px rgba(0, 243, 255, 0.5), 0 0 20px rgba(0, 243, 255, 0.3)',
        'neon-hover': '0 0 15px rgba(0, 243, 255, 0.7), 0 0 30px rgba(0, 243, 255, 0.5)',
        'danger-glow': '0 0 10px rgba(255, 0, 60, 0.5)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'flicker': 'flicker 1.5s infinite alternate',
      },
      keyframes: {
        flicker: {
          '0%, 19%, 21%, 23%, 25%, 54%, 56%, 100%': {
            opacity: '1',
          },
          '20%, 24%, 55%': {
            opacity: '0.4',
          },
        }
      }
    },
  },
  plugins: [],
}
