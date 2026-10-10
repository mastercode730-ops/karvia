import type { Config } from 'tailwindcss';

// Tokens from the Karvia design system board.
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#0B6E4F', dark: '#08523B', tint: '#E3F2EC', mid: '#0E8060' },
        gold: { DEFAULT: '#F4A51C', tint: '#FFF3DC', text: '#8A5A00', line: '#F0DDB4' },
        ink: { DEFAULT: '#13213C', 2: '#22314F', admin: '#0E1830' },
        slate: { DEFAULT: '#3D4A5C' },
        muted: '#5E6B7D',
        line: { DEFAULT: '#E3E6EB', strong: '#CBD2DB' },
        canvas: '#F4F6F9',
        info: { DEFAULT: '#1D4ED8', tint: '#E8EEFC' },
        alert: { DEFAULT: '#C2362F', text: '#A3261F', tint: '#FBE4E2' },
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      borderRadius: { xl: '14px', '2xl': '18px' },
      maxWidth: { page: '1240px' },
    },
  },
  plugins: [],
} satisfies Config;
