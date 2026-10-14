import "server-only";
import { eq, sql } from "drizzle-orm";
import { DEFAULT_TEMPLATES } from "@/lib/default-sign-templates";
import { db, schema } from "@/server/db";

export { DEFAULT_TEMPLATES };

/* Adds the starter documents if the agency has none yet. Safe to run more than once. */
export async function ensureDefaultTemplates() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.signTemplates);
  if (n > 0) return 0;
  const types = await db.select({ id: schema.documentTypes.id, name: schema.documentTypes.name }).from(schema.documentTypes);
  for (const template of DEFAULT_TEMPLATES) {
    await db.insert(schema.signTemplates).values({
      title: template.title,
      category: template.category,
      typeId: types.find(type => type.name === template.typeName)?.id ?? null,
      body: template.body,
      initialEach: true,
    });
  }
  return DEFAULT_TEMPLATES.length;
}

export async function templateById(id: string) {
  const [row] = await db.select().from(schema.signTemplates).where(eq(schema.signTemplates.id, id)).limit(1);
  return row ?? null;
}
