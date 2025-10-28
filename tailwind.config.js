/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary': {
          light: '#4f46e5',
          dark: '#6366f1',
        },
        'secondary': {
          light: '#10b981',
          dark: '#34d399',
        },
        'background': {
          light: '#f9fafb',
          dark: '#111827',
        },
        'foreground': {
          light: '#1f2937',
          dark: '#f9fafb',
        },
        'card': {
          light: '#ffffff',
          dark: '#1f2937',
        },
        'border': {
            light: '#e5e7eb',
            dark: '#374151',
        }
      },
      keyframes: {
        flip: {
          '0%': { transform: 'rotateY(0deg)' },
          '100%': { transform: 'rotateY(180deg)' },
        },
        flip_back: {
          '0%': { transform: 'rotateY(180deg)' },
          '100%': { transform: 'rotateY(0deg)' },
        },
        'fade-in-up': {
            '0%': { opacity: '0', transform: 'translateY(20px)' },
            '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        flip: 'flip 0.6s forwards',
        'flip-back': 'flip_back 0.6s forwards',
        'fade-in-up': 'fade-in-up 0.5s ease-out forwards',
      },
    }
  },
  plugins: [],
}