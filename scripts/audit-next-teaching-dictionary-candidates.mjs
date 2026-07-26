import fs from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_TRANSACTION;
if (!connectionString) throw new Error("Missing SUPABASE_PRODUCTION_DB_URL_POOLER_TRANSACTION");

const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function query(text, params = []) {
  const result = await pool.query(text, params);
  return result.rows;
}

try {
  const tables = await query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and (
        table_name like '%spelling%'
        or table_name like '%teaching_dictionary%'
        or table_name like '%writing%'
        or table_name = 'children'
        or table_name like 'adle_learning%'
      )
    order by table_name
  `);
  const columns = await query(`
    select table_name, column_name, data_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = any($1::text[])
    order by table_name, ordinal_position
  `, [tables.map((row) => row.table_name)]);
  const children = await query(`select id, name, is_archived from public.children order by created_at`);
  const dictionaryCount = await query(`select count(*)::int as count from public.canonical_teaching_dictionary_words where row_status = 'active'`);
  const output = { tables, columns, children, dictionaryCount };
  await fs.writeFile("/tmp/scarlett_dictionary_schema_audit.json", JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ tableCount: tables.length, childCount: children.length, children, dictionaryCount }, null, 2));
} finally {
  await pool.end();
}
