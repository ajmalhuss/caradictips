/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      // Slightly larger base size than default: the audience skews older, and the
      // whole layout is sized off these steps rather than one-off pixel values.
      fontSize: {
        base: ["1.0625rem", { lineHeight: "1.65" }],
      },
      colors: {
        // A hair warmer than slate-50 so the white cards read as raised paper.
        canvas: "#f6f7f9",
      },
      boxShadow: {
        card: "0 1px 2px rgb(15 23 42 / 0.04), 0 4px 12px -2px rgb(15 23 42 / 0.06)",
        "card-hover":
          "0 1px 2px rgb(15 23 42 / 0.04), 0 10px 24px -6px rgb(15 23 42 / 0.12)",
      },
    },
  },
  plugins: [],
};