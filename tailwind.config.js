/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        neonPurple: '#A020F0',
        neonMagenta: '#7F00FF',
        neonCyan: '#00C6FF',
      },
      backgroundImage: {
        'neon-gradient':
          'linear-gradient(135deg, #A020F0 0%, #7F00FF 50%, #00C6FF 100%)',
      },
      boxShadow: {
        'neon-glow':
          '0 0 20px rgba(160,32,240,0.3), 0 0 40px rgba(0,198,255,0.2)',
      },
      animation: {
        'pulse-glow': 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
      },
    },
  },
  plugins: [],
};