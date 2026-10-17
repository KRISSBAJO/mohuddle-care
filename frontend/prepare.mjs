import { cp } from "node:fs/promises";
await cp(new URL("../public/", import.meta.url), new URL("./public/", import.meta.url), { recursive: true });
for (const entry of ["components/mohuddle", "components/marketing/Logo.tsx", "lib/product.ts", "lib/cn.ts", "app/mohuddle/page.tsx", "app/globals.css"]) {
  await cp(new URL(`../src/${entry}`, import.meta.url), new URL(`./src/${entry}`, import.meta.url), { recursive: true });
}
