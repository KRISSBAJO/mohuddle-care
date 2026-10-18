import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

// Opt-in, disposable TEST agencies only. Never seed or alter existing care records.
test("mobile notes: corrections, reviews, tenant boundaries and retry-safe incidents", { skip: process.env.RUN_NOTE_DB_TESTS !== "1", timeout: 180_000 }, async () => {
  process.env.STORAGE_DIR = "output/note-test-storage";
  delete process.env.S3_BUCKET;
  const { asAgency, db, systemDb, schema, pool, systemPool } = await import("../src/server/db");
  const { eq } = await import("drizzle-orm");
  const flow = await import("../src/server/note-workflow");
  const { mobileNoteInbox, mobileNoteRecord } = await import("../src/server/mobile/note-workflow");
  const { saveCommunityNote } = await import("../src/server/community-notes");
  const { addIncidentPhoto } = await import("../src/server/incident-photos");
  const { storage } = await import("../src/server/docs/storage");
  const { fileIncident } = await import("../src/server/incident-report");
  const { dateKey } = await import("../src/lib/format");
  const agency = randomUUID(), foreignAgency = randomUUID();
  const logins: string[] = [];
  try {
    await systemDb.insert(schema.agencies).values([agency, foreignAgency].map(id => ({ id, slug: `test-notes-${id}`, name: "TEST notes workflow", legalName: "TEST notes workflow" })));
    await asAgency(agency, async () => {
      const users = [];
      for (const role of ["admin", "dsp", "nurse", "dsp"] as const) {
        const loginId = randomUUID(); logins.push(loginId);
        const email = `test-note-${loginId}@example.com`;
        await systemDb.insert(schema.logins).values({ id: loginId, email, passwordHash: "TEST-no-sign-in" });
        const [staff] = await db.insert(schema.staff).values({ firstName: "TEST", lastName: role + loginId.slice(0, 4), email, role }).returning();
        const [user] = await db.insert(schema.users).values({ loginId, email, name: `${staff.firstName} ${staff.lastName}`, role, staffId: staff.id }).returning();
        users.push(user);
      }
      const [admin, writer, nurse, lead] = users;
      const [home] = await db.insert(schema.homes).values({ name: "TEST home", type: "group_home", managerStaffId: lead.staffId }).returning();
      const [person] = await db.insert(schema.individuals).values({ firstName: "TEST", lastName: "Person", serviceType: "supported_living", homeId: home.id }).returning();
      const today = dateKey();
      const [note] = await db.insert(schema.dailyLogs).values({ individualId: person.id, staffId: writer.staffId, signedName: writer.name, signedAt: new Date(), logDate: today, notes: "Initial TEST note. ".repeat(15), mood: "good" }).returning();
      const version = flow.noteVersion(note);
      assert.ok((await flow.approveNote(writer, "daily", note.id, version)).error, "cannot approve own note");
      assert.ok((await flow.approveNote(nurse, "daily", note.id, version)).error, "unconfigured nurse cannot approve");
      assert.equal((await mobileNoteInbox(lead, Date.now())).review[0]?.id, note.id, "home lead gets review queue");
      const returned = new FormData(); returned.set("reason", "Please clarify the handover."); returned.set("version", version);
      assert.equal((await flow.returnNote(lead, "daily", note.id, returned)).error, undefined);
      assert.equal((await mobileNoteInbox(writer, Date.now())).returned[0]?.id, note.id);
      assert.ok((await flow.approveNote(admin, "daily", note.id, version)).error, "stale reviews refused");
      const record = await mobileNoteRecord(writer, "daily", note.id, Date.now()); assert.ok(record);
      const edit = new FormData(); edit.set("version", record.version); edit.set("notes", "Corrected TEST handover with enough detail. ".repeat(10));
      assert.equal((await flow.editDailyLog(writer, note.id, edit)).error, undefined);
      const corrected = await mobileNoteRecord(writer, "daily", note.id, Date.now()); assert.ok(corrected);
      assert.equal(corrected.note.status, "submitted");
      assert.ok(corrected.events.some(event => event.action === "resubmitted" && event.changes.some(change => change.field === "Shift summary")));
      const outcomes = await Promise.all([flow.approveNote(admin, "daily", note.id, corrected.version), flow.approveNote(lead, "daily", note.id, corrected.version)]);
      assert.equal(outcomes.filter(result => !result.error).length, 1, "one approval event under concurrent reviews");
      assert.ok((await flow.editDailyLog(writer, note.id, edit)).error, "approved notes locked");
      const locked = await mobileNoteRecord(admin, "daily", note.id, Date.now()); assert.ok(locked);
      assert.equal(locked.events.filter(event => event.action === "approved").length, 1);
      assert.equal((await flow.reopenNote(admin, "daily", note.id, locked.version)).error, undefined);
      await asAgency(foreignAgency, async () => {
        assert.equal(await mobileNoteRecord({ ...admin, agencyId: foreignAgency }, "daily", note.id, Date.now()), null);
        assert.ok((await flow.approveNote({ ...admin, agencyId: foreignAgency }, "daily", note.id, corrected.version)).error);
      });
      const cp = new FormData();
      for (const [key, value] of Object.entries({ individualId: person.id, noteDate: today, startTime: "09:00", endTime: "10:00", location: "TEST community", activity: "TEST activity", note: "TEST community note. ".repeat(20), attest: "on" })) cp.set(key, value);
      const community = await Promise.all([saveCommunityNote(writer, cp), saveCommunityNote(writer, cp)]);
      assert.equal(community.filter(result => "id" in result).length, 1, "overlapping concurrent notes refused");
      const requestId = randomUUID();
      const incident = { individualId: person.id, occurredDate: today, occurredTime: "00:00", witnessType: "witnessed", otherEventText: "TEST only", description: "TEST incident created only to verify safe submission retries.", injury: "no", actionsTaken: "TEST fixture" };
      const reports = await Promise.all([fileIncident(writer, incident, requestId), fileIncident(writer, incident, requestId)]);
      assert.ok(reports.every(result => result.id === requestId), "lost response retry reuses incident");
      assert.ok((await fileIncident(nurse, incident, requestId)).error, "cannot claim another reporter's request");
      const uploadId = randomUUID();
      const photos = await Promise.all([addIncidentPhoto(writer, requestId, Buffer.from([255, 216, 255, 217]), "image/jpeg", "TEST photo", uploadId), addIncidentPhoto(writer, requestId, Buffer.from([255, 216, 255, 217]), "image/jpeg", "TEST photo", uploadId)]);
      assert.ok(photos.every(result => result.id === uploadId), "photo retries return the same attachment");
      assert.ok((await addIncidentPhoto(nurse, requestId, Buffer.from([255, 216, 255, 217]), "image/jpeg", "", randomUUID())).error);
      const cpSaved = community.find(result => "id" in result); assert.ok(cpSaved && cpSaved.id);
      cp.set("startTime", "11:00"); cp.set("endTime", "12:00"); cp.set("_requestId", randomUUID());
      const retryCp = await Promise.all([saveCommunityNote(writer, cp), saveCommunityNote(writer, cp)]);
      assert.ok(retryCp.every(result => result.id === cp.get("_requestId")), "community retry reuses the note");
      console.log("TEST notes workflow: permissions, return/resubmit, audit, concurrency, tenant isolation, community overlap and incident retries passed");
    });
  } catch (error) {
    console.error("TEST failure:", error instanceof Error ? error.message : "unknown", error instanceof Error && error.cause instanceof Error ? error.cause.message : "");
    throw error;
  } finally {
    // These two TEST agencies were allocated above; no existing agency IDs are ever used.
    for (const id of [agency, foreignAgency]) {
      const storedPhotos = await systemPool.query("select storage_key from incident_photos where agency_id=$1", [id]);
      for (const photo of storedPhotos.rows) await storage().remove(photo.storage_key);
      for (const table of ["note_events", "incident_photos", "audit_log", "notifications", "daily_logs", "community_notes", "incidents", "settings", "individuals", "users", "homes", "staff"]) await systemPool.query(`delete from "${table}" where agency_id=$1`, [id]);
      await systemDb.delete(schema.agencies).where(eq(schema.agencies.id, id));
    }
    for (const id of logins) await systemDb.delete(schema.logins).where(eq(schema.logins.id, id));
    await pool.end(); await systemPool.end();
  }
});
