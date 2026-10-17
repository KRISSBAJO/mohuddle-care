import type { MetadataRoute } from "next";

/* Lets staff add Mohuddle to their phone's Home Screen. On iPhone this is needed for notifications. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mohuddle",
    short_name: "Mohuddle",
    description: "Care operations: shifts, notes, medications and the time clock.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#f7f7ef",
    theme_color: "#173e35",
    icons: [{ src: "/brand/mohuddle-icon-v2.png", sizes: "1254x1254", type: "image/png", purpose: "any" }],
  };
}
