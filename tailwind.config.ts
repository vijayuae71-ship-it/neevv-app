import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        neevv: {
          primary: '#2D3436',
          accent: '#E17055',
          blue: '#0984E3',
          green: '#00B894',
          gold: '#FDCB6E',
          purple: '#6C5CE7',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: ['dark', 'light'],
  },
}
export default config
