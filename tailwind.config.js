module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'dark-blue': 'var(--color-foreground)', // Maps to #1E3A8A
        'light-green': 'var(--color-accent)',   // Maps to #90EE90 (updated from #10B981)
      },
      fontFamily: {
        'sans': ['var(--font-sans, Arial, Helvetica, sans-serif)'],
        'mono': ['var(--font-mono, "Courier New", Courier, monospace)'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};