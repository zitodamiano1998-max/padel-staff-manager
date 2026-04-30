/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif'],
      },
      colors: {
        cream: {
          50:  '#FDFBF7',
          100: '#FAF6F0',
          200: '#F4ECDF',
          300: '#EBDFC9',
        },
        terracotta: {
          50:  '#FBF1EC',
          100: '#F2D9CB',
          200: '#E5B59A',
          300: '#D49774',
          400: '#C97D60', // primary
          500: '#B5664A',
          600: '#9A5238',
          700: '#7A3F2B',
        },
        sage: {
          400: '#5C8D7E',
          500: '#477365',
        },
        warm: {
          beige: '#D4A574',
          brown: '#8B7355',
          dark:  '#3D2914',
        },
      },
      borderRadius: {
        'xl': '0.875rem',
        '2xl': '1.125rem',
      },
    },
  },
  plugins: [],
}
