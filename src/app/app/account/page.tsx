import { PasswordForm } from "@/components/app/PasswordForm";
import { PageHeader, Panel } from "@/components/app/ui";
import { loginRoleLabel } from "@/lib/account-policy";
import { changeOwnPassword } from "@/server/actions/accounts";
import { requireUser } from "@/server/guard";
import { getSettings } from "@/server/settings";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const user = await requireUser();
  const settings = await getSettings();
  return (
    <div className="max-w-2xl">
      <PageHeader eyebrow="My account" title={user.name} description={`${user.email} · ${loginRoleLabel[user.role]}`} />
      <Panel title="Change your password">
        <div className="p-5">
          <PasswordForm action={changeOwnPassword} minLength={settings.password_min_length} askCurrent submitLabel="Change password" />
        </div>
      </Panel>
      <p className="mt-4 text-xs text-mute">Forgot your password while signed out? Ask a coordinator for a reset link.</p>
    </div>
  );
}
