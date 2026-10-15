import { redirect } from "next/navigation";
import { OwnerPasswordForm } from "@/components/owner/OwnerAuthForms";
import { getOwner } from "@/server/owner-auth";

/* The owner console's sign-in: email and password first. */
export default async function OwnerLoginPage() {
  if (await getOwner()) redirect("/owner");
  return (
    <>
      <p className="eyebrow">Mohuddle admin</p>
      <h1 className="mt-1 text-3xl font-bold">Sign in</h1>
      <p className="mt-2 text-sm text-mute">For Mohuddle owners. Agency staff sign in at their agency&apos;s own address.</p>
      <OwnerPasswordForm />
    </>
  );
}
