import { redirect } from "next/navigation";
import { OwnerCodeForm } from "@/components/owner/OwnerAuthForms";
import { readPending } from "@/server/owner-auth";

/* The second step: a code from the authenticator app. */
export default async function OwnerVerifyPage() {
  const pending = await readPending();
  if (!pending || pending.stage !== "code") redirect("/owner/login");
  return (
    <>
      <p className="eyebrow">Mohuddle admin</p>
      <h1 className="mt-1 text-3xl font-bold">Enter your code</h1>
      <p className="mt-2 text-sm text-mute">Open your authenticator app and type the 6 digits it shows for Mohuddle.</p>
      <OwnerCodeForm />
    </>
  );
}
