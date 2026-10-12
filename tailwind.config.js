/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        surface2: v('surface2'),
        line: v('line'),
        ink: v('ink'),
        muted: v('muted'),
        accent: v('accent'),
        accent2: v('accent2'),
        warn: v('warn'),
        danger: v('danger'),
        onaccent: v('onaccent'),
      },
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', '-apple-system', 'BlinkMacSystemFont', '"SF Arabic"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glass: '0 1px 0 rgba(255,255,255,0.9) inset, 0 10px 30px -12px rgba(31,70,60,0.18)',
        lift: '0 12px 28px -10px rgba(31,143,118,0.55)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}
