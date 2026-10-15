import "dotenv/config";
import { Pool } from "pg";

/*
 * Makes a login a Mohuddle owner, who may open the owner console across every agency. The app itself
 * can never grant this.
 *
 *   pnpm tsx scripts/make-owner.ts someone@example.com [--name "Their Name"]
 *   pnpm tsx scripts/make-owner.ts someone@example.com --remove
 *   pnpm tsx scripts/make-owner.ts someone@example.com --reset-two-factor   (a lost phone)
 *
 * The email must already have a login (a place in an agency, with a password chosen).
 */
async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  const remove = process.argv.includes("--remove");
  const resetTwoFactor = process.argv.includes("--reset-two-factor");
  const nameAt = process.argv.indexOf("--name");
  const name = nameAt > 0 ? (process.argv[nameAt + 1] ?? "").trim() : "";
  if (!email.includes("@")) throw new Error("Give the email of an existing login.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    if (resetTwoFactor) {
      const { rowCount } = await pool.query("update logins set totp_secret = null, totp_enabled_at = null, backup_codes = '[]'::jsonb where email = $1 and is_owner", [email]);
      if (!rowCount) throw new Error(`${email} is not an owner.`);
      await pool.query("delete from owner_sessions where login_id = (select id from logins where email = $1)", [email]);
      console.log(`${email} has no authenticator app now, and is signed out of the console. They add one again at their next sign-in.`);
      return;
    }
    const { rowCount } = await pool.query("update logins set is_owner = $1, owner_name = case when $3 <> '' then $3 else owner_name end where email = $2", [!remove, email, name]);
    if (!rowCount) throw new Error(`No login uses ${email}. Give them a login in an agency first, or ask for a way to add an owner without one.`);
    if (remove) await pool.query("delete from owner_sessions where login_id = (select id from logins where email = $1)", [email]);
    console.log(remove ? `${email} is no longer an owner.` : `${email} is now an owner. Sign in at the admin address, /owner/login.`);
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
