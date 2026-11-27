module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'dark-blue': 'var(--color-foreground)', // Maps to #1E3A8A
        'light-green': 'var(--color-accent)',   // Maps to #90EE90 (updated from #10B981)
        background: 'var(--color-background)',
        foreground: 'var(--color-foreground)',
        surface: 'var(--surface)',
        'surface-elevated': 'var(--surface-elevated)',
        'surface-secondary': 'var(--surface-secondary)',
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        primary: 'var(--color-primary)',
        'primary-foreground': 'var(--color-primary-foreground)',
        'primary-hover': 'var(--color-primary-hover)',
        muted: 'var(--color-muted)',
        'muted-foreground': 'var(--color-muted-foreground)',
        'muted-hover': 'var(--color-muted-hover)',
        card: 'var(--color-card)',
        border: 'var(--color-border)',
        'border-subtle': 'var(--border-subtle)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        info: 'var(--info)',
        input: 'var(--input)',
        'input-border': 'var(--input-border)',
        sidebar: 'var(--sidebar)',
        'sidebar-foreground': 'var(--sidebar-foreground)',
        ring: 'var(--color-ring)',
      },
      fontFamily: {
        'sans': ['var(--font-sans, Arial, Helvetica, sans-serif)'],
        'mono': ['var(--font-mono, "Courier New", Courier, monospace)'],
        'display': ['var(--font-display, "Times New Roman", serif)'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
