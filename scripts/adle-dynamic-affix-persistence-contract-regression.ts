#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const migration = readFileSync(resolve(root, "supabase/migrations/20260808093000_fix_dynamic_affix_canonical_intake_persistence.sql"), "utf8");
const live = readFileSync(resolve(root, "lib/adle/loaders/canonical-intake-live.ts"), "utf8");

assert.match(live, /p_route_id: resolution\.routeId/);
assert.match(live, /p_route_version: resolution\.routeVersion/);
assert.match(migration, /Dynamic Affix candidate must request dynamic_affix_word_lab:v3/);
assert.match(migration, /v_route_id := 'dynamic_affix_word_lab'; v_route_version := 'v3'/);
assert.match(migration, /canonical_teaching_dictionary_suffix_profiles/);
assert.match(migration, /canonical_teaching_dictionary_suffix_members/);
assert.match(migration, /p\.production_enabled=true/);
assert.match(migration, /m\.assignment_eligible=true/);
assert.match(migration, /Dynamic Prefix candidate requested an invalid route/);
assert.match(migration, /generic candidate requested an invalid route/);
assert.match(migration, /supersede_spelling_canonical_mapping_admin/);
assert.match(migration, /mapping_status='superseded'/);
assert.match(migration, /replacement_mapping_id=v_new_id/);
assert.match(migration, /resolver_visibility_status='hidden'/);
console.log("adle-dynamic-affix-persistence-contract-regression: ok");
