/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}', './integrations/ppt-web/ui/src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // T8-penguin-canvas 自定义色板(可后续完善)
        canvas: {
          dark: '#0a0a0b',
          light: '#fafafa',
        },
        primary: 'var(--ds-primary)',
        'primary-hover': 'var(--ds-primary-hover)',
        'primary-muted': 'var(--ds-primary-muted)',
        'primary-fg': 'var(--ds-primary-fg)',
        accent: 'var(--ds-accent)',
        'accent-muted': 'var(--ds-accent-muted)',
        surface: 'var(--ds-surface)',
        'surface-elevated': 'var(--ds-surface-elevated)',
        sidebar: 'var(--ds-sidebar-bg)',
        border: 'var(--ds-border)',
        foreground: 'var(--ds-text)',
        'muted-fg': 'var(--ds-muted-fg)',
        danger: 'var(--ds-danger)',
        'danger-hover': 'var(--ds-danger-hover)',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
