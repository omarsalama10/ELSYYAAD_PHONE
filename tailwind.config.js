/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b0f14',
        surface: '#141a22',
        surface2: '#1c2430',
        line: '#2a3442',
        ink: '#e8edf3',
        muted: '#8b98a9',
        accent: '#22c55e',
        accent2: '#38bdf8',
        warn: '#f59e0b',
        danger: '#ef4444',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Arabic"', '"Geeza Pro"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
