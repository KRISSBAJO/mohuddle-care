import { redirect } from "next/navigation";
import { OwnerSetupForm } from "@/components/owner/OwnerAuthForms";
import { groupSecret, otpauthUrl } from "@/lib/totp";
import { getOwner, setupSecret } from "@/server/owner-auth";

/* The first sign-in: adding Mohuddle to an authenticator app, which every later sign-in needs. */
export default async function OwnerSetupPage() {
  const setup = await setupSecret();
  // Just switched on: the page reloads once the owner is signed in. It keeps the same shape, so the
  // form (which holds the backup codes) stays and shows them, instead of moving on before they are saved.
  const finished = !setup && Boolean(await getOwner());
  if (!setup && !finished) redirect("/owner/login");
  return (
    <>
      <p className="eyebrow">Mohuddle admin</p>
      <h1 className="mt-1 text-3xl font-bold">Protect your sign-in</h1>
      <p className="mt-2 text-sm text-mute">The owner console can reach every agency, so it needs a code from your phone as well as your password. This takes a minute, once.</p>
      <OwnerSetupForm secret={setup?.secret ?? ""} grouped={setup ? groupSecret(setup.secret) : ""} url={setup ? otpauthUrl(setup.secret, setup.email) : ""} finished={finished} />
    </>
  );
}
