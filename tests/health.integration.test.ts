import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";

const skip = process.env.RUN_DB_TESTS !== "1";

test("the health report reads the last reminder run, problems and the database", { skip }, async () => {
  const { pool, systemPool } = await import("../src/server/db");
  const { noteProblem, noteSweep } = await import("../src/server/health-log");
  const { healthReport } = await import("../src/server/health");
  try {
    const empty = await healthReport();
    assert.equal(empty.sweep.level, "warn", "No run yet since start is worth a look");
    assert.equal(empty.database.level, "good");
    assert.ok((empty.database.migrations ?? 0) > 30);

    const now = Date.now();
    noteSweep({ startedAt: now - 400, finishedAt: now, sent: 2, agencies: 1, failures: [] });
    noteProblem("GET /app/example", new Error("Example failure"));
    const report = await healthReport();
    assert.equal(report.sweep.level, "good");
    assert.equal(report.sweep.last?.sent, 2);
    assert.equal(report.problems[0].where, "GET /app/example");
    assert.equal(report.problems[0].message, "Example failure");

    // A run that found a failing agency needs a look; an old run means the timer has stopped.
    noteSweep({ startedAt: now, finishedAt: now, sent: 0, agencies: 2, failures: [{ at: now, where: "Notification sweep: example", message: "boom" }] });
    assert.equal((await healthReport()).sweep.level, "warn");
    noteSweep({ startedAt: now - 600_000, finishedAt: now - 600_000, sent: 0, agencies: 1, failures: [] });
    assert.equal((await healthReport()).sweep.level, "bad");
  } finally {
    await pool.end();
    await systemPool.end();
  }
});
