import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#172026",
        panel: "#f8faf9",
        line: "#d9e2df",
        teal: "#0f766e",
        coral: "#d65f45",
        gold: "#b98900"
      }
    }
  },
  plugins: []
};

export default config;
