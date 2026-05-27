/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "rgba(255, 255, 255, 0.08)",
        input: "rgba(255, 255, 255, 0.05)",
        ring: "rgba(139, 92, 246, 0.5)",
        background: "#08070d",
        foreground: "#f3f4f6",
        primary: {
          DEFAULT: "#8b5cf6", // Violet neon glow primary
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "#3b82f6", // Blue glow secondary
          foreground: "#ffffff",
        },
        accent: {
          DEFAULT: "#06b6d4", // Cyan highlights
          foreground: "#0f172a",
        },
        card: {
          DEFAULT: "rgba(18, 16, 28, 0.6)", // Glass card background
          foreground: "#f3f4f6",
        },
        popover: {
          DEFAULT: "#0f0e17",
          foreground: "#f3f4f6",
        },
        muted: {
          DEFAULT: "rgba(255, 255, 255, 0.4)",
          foreground: "rgba(255, 255, 255, 0.6)",
        },
      },
      borderRadius: {
        lg: "12px",
        md: "8px",
        sm: "6px",
      },
      backgroundImage: {
        "radial-dark": "radial-gradient(ellipse at top, #140f28, #07060b, #040306)",
        "glass-gradient": "linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.02) 100%)",
        "glow-purple-blue": "linear-gradient(90deg, #8b5cf6, #3b82f6)",
      },
      boxShadow: {
        "neon-purple": "0 0 15px rgba(139, 92, 246, 0.3)",
        "neon-blue": "0 0 15px rgba(59, 130, 246, 0.3)",
        "neon-cyan": "0 0 15px rgba(6, 182, 212, 0.3)",
        "glass": "inset 0 1px 1px rgba(255, 255, 255, 0.05), 0 4px 20px rgba(0, 0, 0, 0.5)",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "0.25", filter: "blur(40px)" },
          "50%": { opacity: "0.55", filter: "blur(60px)" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      animation: {
        "pulse-glow": "pulse-glow 6s infinite ease-in-out",
        "float": "float 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
}
