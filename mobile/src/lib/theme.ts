/* Mohuddle's colours and type, the same as the web app and owner console. */
export const colors = {
  brand: "#173e35",
  brandMid: "#24564a",
  lime: "#dcef98",
  sage: "#2f7d5b",
  sageSoft: "#e3f1e8",
  ground: "#f3f4ef",
  // A very light wash of the brand green, for page headers.
  wash: "#e9f2e3",
  card: "#ffffff",
  ink: "#16211e",
  mute: "#5d6b66",
  dim: "#9aa49f",
  line: "#e3e2dc",
  amber: "#8a5a10",
  amberSoft: "#fbefd5",
  flag: "#b3261e",
  flagSoft: "#fbe4e1",
  sky: "#e3eef7",
  skyInk: "#1f4f7a",
  onBrandSoft: "#c9d8d2",
};

/* Plus Jakarta Sans: modern and rounded, with strong bold weights for headings and numbers. */
export const fonts = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  heavy: "PlusJakartaSans_800ExtraBold",
};

/* Soft depth instead of outlines, for cards on the light page. */
export const shadow = {
  soft: { shadowColor: "#173e35", shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  float: { shadowColor: "#173e35", shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
};
