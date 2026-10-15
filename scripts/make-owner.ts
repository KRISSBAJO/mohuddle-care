import "dotenv/config";
import { Pool } from "pg";

/*
 * Makes a login a Mohuddle owner, who may open the owner console across every agency. The app itself
 * can never grant this. Usage: pnpm tsx scripts/make-owner.ts someone@example.com [--remove]
 */
async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  const remove = process.argv.includes("--remove");
  if (!email.includes("@")) throw new Error("Give the email of an existing login.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const { rowCount } = await pool.query("update logins set is_owner = $1 where email = $2", [!remove, email]);
    if (!rowCount) throw new Error(`No login uses ${email}. They need a login in an agency first.`);
    console.log(remove ? `${email} is no longer an owner.` : `${email} is now an owner. The owner console is at /owner.`);
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
