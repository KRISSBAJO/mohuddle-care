"use client";

import { useState } from "react";
import { Select } from "@/components/app/Select";
import { TIME_ZONES } from "@/lib/agency-defaults";

type Profile = { name: string; legalName: string; phone: string; email: string; address: string; cityStateZip: string; timezone: string };

const blank: Profile = { name: "", legalName: "", phone: "", email: "", address: "", cityStateZip: "", timezone: "America/Chicago" };

const toSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");

/* An agency's profile. When creating one, also its web address name and first administrator. */
export function AgencyFields({ initial = blank, creating = false }: { initial?: Profile; creating?: boolean }) {
  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const shownSlug = slugEdited ? slug : toSlug(name);
  const label = "grid gap-1.5 text-sm font-medium";

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className={label}>
        Agency name
        <input name="name" required maxLength={80} value={name} onChange={event => setName(event.target.value)} className="field" placeholder="Short name staff will see" />
      </label>
      <label className={label}>
        Legal name
        <input name="legalName" required maxLength={160} defaultValue={initial.legalName} className="field" placeholder="As printed on signed documents" />
      </label>
      {creating && (
        <label className={`${label} sm:col-span-2`}>
          Web address
          <span className="flex items-center overflow-hidden rounded-xl border border-line bg-white focus-within:ring-2 focus-within:ring-brand/30">
            <input
              name="slug"
              required
              maxLength={40}
              value={shownSlug}
              onChange={event => {
                setSlugEdited(true);
                setSlug(event.target.value.toLowerCase());
              }}
              className="min-w-0 flex-1 border-0 bg-transparent px-3.5 py-2.5 text-sm outline-none"
            />
            <span className="shrink-0 border-l border-line bg-panel px-3 py-2.5 text-sm text-mute">.mohuddle.com</span>
          </span>
          <span className="text-xs font-normal text-mute">Lowercase letters, numbers and dashes. This cannot be changed later.</span>
        </label>
      )}
      <label className={label}>
        Office phone
        <input name="phone" maxLength={40} defaultValue={initial.phone} className="field" autoComplete="off" />
      </label>
      <label className={label}>
        Office email
        <input name="email" type="email" maxLength={200} defaultValue={initial.email} className="field" autoComplete="off" />
      </label>
      <label className={label}>
        Street address
        <input name="address" maxLength={200} defaultValue={initial.address} className="field" autoComplete="off" />
      </label>
      <label className={label}>
        City, state and ZIP
        <input name="cityStateZip" maxLength={120} defaultValue={initial.cityStateZip} className="field" autoComplete="off" />
      </label>
      <div className={label}>
        <span>Time zone</span>
        <Select name="timezone" defaultValue={initial.timezone} options={TIME_ZONES} aria-label="Time zone" />
        <span className="text-xs font-normal text-mute">Saved now. The app shows Central time until each agency&apos;s own time zone is switched on.</span>
      </div>
      {creating && (
        <>
          <p className="border-t border-line pt-4 text-sm font-bold sm:col-span-2">First administrator</p>
          <label className={label}>
            Their name
            <input name="adminName" required maxLength={120} className="field" autoComplete="off" />
          </label>
          <label className={label}>
            Their email
            <input name="adminEmail" type="email" required maxLength={200} className="field" autoComplete="off" />
          </label>
        </>
      )}
    </div>
  );
}
