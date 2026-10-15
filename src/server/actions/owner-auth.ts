"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { finishOwnSetup, finishSetup, newBackupCodes, ownerCodeStep, ownerPasswordStep, requireOwner, signOutOtherOwnerSessions, signOutOwner } from "@/server/owner-auth";
import { recordOwnerEvent } from "@/server/owner";

export type OwnerSignInState = { error?: string };
export type SetupState = { error?: string; backupCodes?: string[] };

const credentials = z.object({ email: z.email().max(200), password: z.string().min(1).max(200) });

export async function ownerSignInAction(_previous: OwnerSignInState, formData: FormData): Promise<OwnerSignInState> {
  const parsed = credentials.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Enter your email address and password." };
  const result = await ownerPasswordStep(parsed.data.email, parsed.data.password);
  if ("error" in result) return result;
  redirect(result.next);
}

export async function ownerCodeAction(_previous: OwnerSignInState, formData: FormData): Promise<OwnerSignInState> {
  const result = await ownerCodeStep(String(formData.get("code") ?? "").slice(0, 20));
  if ("error" in result) return result;
  const owner = await requireOwner();
  await recordOwnerEvent(owner, "owner:sign-in", null);
  redirect(result.next);
}

/* The first code from the authenticator app. Shows the backup codes before going on. */
export async function finishSetupAction(_previous: SetupState, formData: FormData): Promise<SetupState> {
  const result = await finishSetup(String(formData.get("code") ?? "").slice(0, 20));
  if ("error" in result) return result;
  const owner = await requireOwner();
  await recordOwnerEvent(owner, "owner:two-factor", null, "Added an authenticator app");
  return { backupCodes: result.backupCodes };
}

export async function ownerSignOutAction() {
  await signOutOwner();
  redirect("/owner/login");
}

export async function newBackupCodesAction(): Promise<SetupState> {
  const owner = await requireOwner();
  const backupCodes = await newBackupCodes(owner.loginId);
  await recordOwnerEvent(owner, "owner:backup-codes", null, "Made new backup codes");
  return { backupCodes };
}

export async function signOutOthersAction(): Promise<OwnerSignInState> {
  const owner = await requireOwner();
  await signOutOtherOwnerSessions(owner.loginId);
  await recordOwnerEvent(owner, "owner:sign-out-others", null);
  return {};
}

/* Switching the authenticator app on while signed in. */
export async function finishOwnSetupAction(_previous: SetupState, formData: FormData): Promise<SetupState> {
  const owner = await requireOwner();
  const result = await finishOwnSetup(owner.loginId, String(formData.get("code") ?? "").slice(0, 20));
  if ("error" in result) return result;
  await recordOwnerEvent(owner, "owner:two-factor", null, "Added an authenticator app");
  return { backupCodes: result.backupCodes };
}
