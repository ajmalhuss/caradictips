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
    },
  },
  plugins: [],
};