import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, resolve } from "node:path";

const require = createRequire(import.meta.url);
const packageRoot = process.env.PATH?.split(delimiter)
  .map((entry) => resolve(entry, "../@electric-sql/pglite"))
  .find(existsSync);
if (!packageRoot) throw new Error("Run with npx --package=@electric-sql/pglite");
const { PGlite } = require(packageRoot);
const db = new PGlite();

try {
  await db.exec(`
    create table public.daily_assignments(id uuid primary key, lesson_route_metadata jsonb);
    create table public.adle_today_session_orchestrations(
      daily_assignment_id uuid primary key, major_stage text not null
    );
    create function public.adle_lesson_route_metadata_is_valid_v1(jsonb)
      returns boolean language sql immutable as $$
        select $1->>'metadataSchemaVersion' = '1' and $1->>'routeId' is not null
      $$;
    create function public.adle_lesson_route_metadata_is_valid_v2(jsonb)
      returns boolean language sql immutable as $$
        select $1->>'metadataSchemaVersion' = '2' and $1->>'routeId' is not null
      $$;
  `);
  await db.exec(readFileSync("supabase/migrations/20261022090000_allow_r6_v2_lesson_route_append.sql", "utf8"));
  await db.exec(`
    create trigger daily_assignments_lesson_route_metadata_immutable
      before update of lesson_route_metadata on public.daily_assignments
      for each row execute function public.prevent_adle_lesson_route_metadata_update();
    insert into public.daily_assignments(id) values
      ('00000000-0000-4000-8000-000000000001'),
      ('00000000-0000-4000-8000-000000000002'),
      ('00000000-0000-4000-8000-000000000003');
    insert into public.adle_today_session_orchestrations values
      ('00000000-0000-4000-8000-000000000001','specialist_generation'),
      ('00000000-0000-4000-8000-000000000002','review'),
      ('00000000-0000-4000-8000-000000000003','specialist_generation');
  `);
  const first = "00000000-0000-4000-8000-000000000001";
  const wrongStage = "00000000-0000-4000-8000-000000000002";
  const second = "00000000-0000-4000-8000-000000000003";
  const v1 = { metadataSchemaVersion: 1, routeId: "generic_composer" };
  const v2 = { metadataSchemaVersion: 2, routeId: "comparative_superlative_word_lab" };
  const update = (id, metadata) => db.query(
    "update public.daily_assignments set lesson_route_metadata=$2 where id=$1", [id, metadata],
  );
  await assert.rejects(update(first, v2), /immutable/, "an unflagged update stays blocked");
  await db.exec("begin; select set_config('adle.r6_specialist_append','on',true);");
  await update(first, v2);
  await db.exec("commit;");
  assert.deepEqual((await db.query("select lesson_route_metadata as metadata from public.daily_assignments where id=$1", [first])).rows[0].metadata, v2);

  await db.exec("begin; select set_config('adle.r6_specialist_append','on',true);");
  await assert.rejects(update(first, v1), /immutable/, "an attached route remains immutable");
  await db.exec("rollback;");

  await db.exec("begin; select set_config('adle.r6_specialist_append','on',true);");
  await assert.rejects(update(wrongStage, v2), /immutable/, "Review stage cannot append a lesson");
  await db.exec("rollback;");

  await db.exec("begin; select set_config('adle.r6_specialist_append','on',true);");
  await assert.rejects(update(second, { metadataSchemaVersion: 3, routeId: "unsupported" }), /immutable/);
  await db.exec("rollback;");

  await db.exec("begin; select set_config('adle.r6_specialist_append','on',true);");
  await update(second, v1);
  await db.exec("commit;");
  console.log("ADLE R6 v1/v2 route append SQL regression passed");
} finally {
  await db.close();
}
