// Production-Grade Design System for Trader Panel
// Financial Brutalism meets Modern Clarity

export const theme = {
  // Color Palette - Deep Navy with Electric Green
  colors: {
    // Primary - Navy Foundation
    navy: {
      50: '#f0f4f8',
      100: '#d9e2ec',
      200: '#bcccdc',
      300: '#9fb3c8',
      400: '#829ab1',
      500: '#627d98',
      600: '#486581',
      700: '#334e68',
      800: '#243b53',
      900: '#102a43',
    },
    
    // Accent - Electric Green (Profit)
    green: {
      50: '#e3f9e5',
      100: '#c1f2c7',
      200: '#91e697',
      300: '#51ca58',
      400: '#31b237',
      500: '#18981d',
      600: '#0f8613',
      700: '#0a740e',
      800: '#056f00',
      900: '#014d00',
    },
    
    // Status Colors
    red: {
      50: '#ffe3e3',
      100: '#ffbdbd',
      200: '#ff9b9b',
      300: '#f86a6a',
      400: '#ef4e4e',
      500: '#e12d39',
      600: '#cf1124',
      700: '#ab091e',
      800: '#8a041a',
      900: '#610316',
    },
    
    amber: {
      50: '#fffbea',
      100: '#fff3c4',
      200: '#fce588',
      300: '#fadb5f',
      400: '#f7c948',
      500: '#f0b429',
      600: '#de911d',
      700: '#cb6e17',
      800: '#b44d12',
      900: '#8d2b0b',
    },
    
    blue: {
      50: '#dceefb',
      100: '#b6e0fe',
      200: '#84c5f4',
      300: '#62b0e8',
      400: '#4098d7',
      500: '#2680c2',
      600: '#186faf',
      700: '#0f609b',
      800: '#0a558c',
      900: '#003e6b',
    },
    
    // Neutrals
    slate: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
    },
  },
  
  // Typography Scale
  typography: {
    fonts: {
      sans: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      mono: "'IBM Plex Mono', 'SF Mono', 'Monaco', 'Inconsolata', monospace",
      display: "'IBM Plex Sans', system-ui, sans-serif",
    },
    
    sizes: {
      xs: '0.75rem',      // 12px
      sm: '0.875rem',     // 14px
      base: '1rem',       // 16px
      lg: '1.125rem',     // 18px
      xl: '1.25rem',      // 20px
      '2xl': '1.5rem',    // 24px
      '3xl': '1.875rem',  // 30px
      '4xl': '2.25rem',   // 36px
      '5xl': '3rem',      // 48px
      '6xl': '3.75rem',   // 60px
    },
    
    weights: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    
    lineHeights: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.75,
    },
  },
  
  // Spacing Scale (4px base)
  spacing: {
    0: '0',
    1: '0.25rem',   // 4px
    2: '0.5rem',    // 8px
    3: '0.75rem',   // 12px
    4: '1rem',      // 16px
    5: '1.25rem',   // 20px
    6: '1.5rem',    // 24px
    8: '2rem',      // 32px
    10: '2.5rem',   // 40px
    12: '3rem',     // 48px
    16: '4rem',     // 64px
    20: '5rem',     // 80px
    24: '6rem',     // 96px
  },
  
  // Border Radius
  radius: {
    none: '0',
    sm: '0.25rem',    // 4px
    base: '0.5rem',   // 8px
    md: '0.75rem',    // 12px
    lg: '1rem',       // 16px
    xl: '1.5rem',     // 24px
    '2xl': '2rem',    // 32px
    full: '9999px',
  },
  
  // Shadows
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
    none: 'none',
  },
  
  // Breakpoints
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
  
  // Z-Index Scale
  zIndex: {
    auto: 'auto',
    0: 0,
    10: 10,
    20: 20,
    30: 30,
    40: 40,
    50: 50,
    modal: 100,
    toast: 200,
  },
  
  // Transitions
  transitions: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    base: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
    bounce: '500ms cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },
};

// CSS Custom Properties Generator
export function generateCSSVariables() {
  const cssVars = [];
  
  // Colors
  Object.entries(theme.colors).forEach(([colorName, shades]) => {
    Object.entries(shades).forEach(([shade, value]) => {
      cssVars.push(`--color-${colorName}-${shade}: ${value};`);
    });
  });
  
  // Typography
  cssVars.push(`--font-sans: ${theme.typography.fonts.sans};`);
  cssVars.push(`--font-mono: ${theme.typography.fonts.mono};`);
  
  return `:root {\n  ${cssVars.join('\n  ')}\n}`;
}

export default theme;