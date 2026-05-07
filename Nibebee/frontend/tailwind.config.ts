import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        "brand-green": "#1B5E20",
        "brand-amber": "#FFA000",
      },
    },
  },
  plugins: [],
};
export default config;
