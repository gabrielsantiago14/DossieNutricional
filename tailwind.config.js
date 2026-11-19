/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        petrol: {
          900: '#13313D',
          800: '#1E4E5F',
          700: '#27657A',
        },
        emeraldBrand: {
          600: '#1B7A5E',
          50: '#E6F2EE',
        },
      },
    },
  },
  plugins: [],
};
