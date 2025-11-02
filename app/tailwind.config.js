/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'class', // Enable dark mode with class strategy
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49'
        }
      },
      // Dark mode specific background and text colors
      backgroundColor: {
        dark: {
          DEFAULT: '#0f172a', // slate-900
          elevated: '#1e293b', // slate-800
          hover: '#334155' // slate-700
        }
      },
      textColor: {
        dark: {
          DEFAULT: '#f1f5f9', // slate-100
          muted: '#cbd5e1', // slate-300
          subtle: '#94a3b8' // slate-400
        }
      }
    }
  },
  plugins: []
}
