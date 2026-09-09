import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F4F6F5',
        ink: {
          DEFAULT: '#14232B',
          soft: '#33454E',
        },
        muted: '#5B6B6F',
        border: '#DDE3E1',
        line: '#E4E9E7',
        brand: {
          DEFAULT: '#1F6F5C',
          dark: '#164F42',
          light: '#E6F0EC',
        },
        amber: {
          DEFAULT: '#C88A2E',
          dark: '#9C6B20',
          light: '#F6E9D4',
        },
        danger: {
          DEFAULT: '#B3261E',
          light: '#FBE9E8',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        sans: ['var(--font-sans)', 'sans-serif'],
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(20, 35, 43, 0.06), 0 1px 1px rgba(20, 35, 43, 0.04)',
      },
    },
  },
  plugins: [],
};

export default config;
