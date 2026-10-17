import { cp, readFile, writeFile } from "node:fs/promises";
await cp(new URL("../public/", import.meta.url), new URL("./public/", import.meta.url), { recursive: true });
for (const entry of ["components/mohuddle", "components/marketing/Logo.tsx", "lib/product.ts", "lib/cn.ts", "lib/client-ip-proof.ts", "app/mohuddle/page.tsx", "app/globals.css"]) {
  await cp(new URL(`../src/${entry}`, import.meta.url), new URL(`./src/${entry}`, import.meta.url), { recursive: true });
}

// Generated source is ignored by Git, so explicitly include it in Tailwind's scan.
const stylesheet = new URL("./src/app/globals.css", import.meta.url);
const css = await readFile(stylesheet, "utf8");
await writeFile(stylesheet, css.replace('@import "tailwindcss";', '@import "tailwindcss";\n@source "../";'));
