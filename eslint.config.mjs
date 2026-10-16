import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [...nextVitals, ...nextTs, { ignores: [".next/**", ".local/**", "next-env.d.ts", "drizzle/**", "public/pdfjs/**", "mobile/**"] }];
export default config;
