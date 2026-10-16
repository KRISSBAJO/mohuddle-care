import { placesFor } from "@/server/auth";
import { currentAgency } from "@/server/agency";
import { currentBilling } from "@/server/billing";
import { PLAN_FEATURES } from "@/lib/billing";
import { zone } from "@/lib/format";
import { phoneRoute, reply } from "@/server/mobile/api";
import { getSettings } from "@/server/settings";

export const dynamic = "force-dynamic";

/* Who is signed in, where, and the agency's rules the app follows. */
export const GET = phoneRoute(async user => {
  const [agency, places, settings, billing] = await Promise.all([currentAgency(), placesFor(user.loginId), getSettings(), currentBilling()]);
  const features = Object.fromEntries(PLAN_FEATURES.map(feature => [feature.key, !billing?.plan || billing.plan.features.includes(feature.key)]));
  return reply({
    user: { name: user.name, email: user.email, role: user.role, isStaff: Boolean(user.staffId), canManage: user.role === "admin" || user.role === "coordinator" },
    agency: agency ? { id: agency.id, name: agency.name, zone: zone() } : null,
    agencies: places.map(place => ({ agencyId: place.agencyId, name: place.name })),
    rules: { lockMinutes: settings.phone_lock_minutes, pinLength: settings.phone_pin_length, biometrics: settings.phone_biometrics === "on", pinAttempts: settings.phone_pin_attempts },
    features: { ...features, scribe: features.scribe && settings.scribe_enabled === "on" },
    readOnly: billing?.state.mode === "read_only",
  });
});
