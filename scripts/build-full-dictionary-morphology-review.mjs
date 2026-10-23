#!/usr/bin/env node
/** Draft structured morphology for the canonical words that lack approved analysis.
 * The existing dictionary's morpheme text is evidence, not approval. No DB writes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const root = resolve(import.meta.dirname, "..");
const file = resolve(root, "data/adle/homophone/convergence-v1/full-dictionary-unanalysed-words-review.csv");
const original = readFileSync(file, "utf8");
const parseCsv = input => {
  const rows = []; let row = [], value = "", quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted && ch === '"' && input[i + 1] === '"') { value += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { row.push(value); value = ""; }
    else if (ch === '\n' && !quoted) { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
    else value += ch;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const fields = rows.shift();
  return rows.filter(row => row.length === fields.length).map(row => Object.fromEntries(fields.map((field, i) => [field, row[i]])));
};
const csv = (fields, rows) => [fields.join(","), ...rows.map(row => fields.map(field => {
  const value = String(row[field] ?? "");
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}).join(","))].join("\n") + "\n";
const current = parseCsv(original);
if (current.length !== 886) throw new Error(`Expected frozen 886-word audit, found ${current.length}`);
if (current.some(row => row.review_status !== "draft" || row.reviewed_by || row.approval_reference))
  throw new Error("Reviewer decisions are present; preserve them and reconcile manually");
const line = readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)
  .find(value => value.startsWith("SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED="));
if (!line) throw new Error("Production database connection unavailable");
let connectionString = line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
const destination = new URL(connectionString);
if (!destination.username.includes("wwohrqtunajrbwxyssjf") || !destination.hostname.endsWith("pooler.supabase.com"))
  throw new Error("Unexpected database project");
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
let source;
try {
  await client.connect(); await client.query("begin read only");
  source = (await client.query(`select w.word_key,w.normalised_word,m.morphemes,m.morphology_notes,
      m.irregularity_notes,m.source_name,m.source_url
    from public.canonical_teaching_dictionary_words w
    join public.canonical_teaching_dictionary_word_metadata m on m.canonical_word_id=w.id
      and m.row_status='active' and m.review_status='approved_for_first_exposure'
    where w.row_status='active' and w.review_status='approved_for_first_exposure'
      and w.dialect_code='en-GB' and not exists (
        select 1 from public.canonical_teaching_dictionary_word_morphology mo
        where mo.canonical_word_id=w.id and mo.row_status='active'
          and mo.review_status='approved_for_first_exposure' and mo.analysis_status='approved')
    order by w.normalised_word,w.word_key`)).rows;
  await client.query("rollback");
} finally { await client.end().catch(() => {}); }
const byKey = new Map(source.map(row => [row.word_key, row]));
if (byKey.size !== current.length || current.some(row => byKey.get(row.word_key)?.normalised_word !== row.word))
  throw new Error("Production dictionary drifted from the frozen 886-word review list");

const canonical = new Map(parseCsv(readFileSync(resolve(root,
  "data/adle/homophone/convergence-v1/full-dictionary-canonical-base-index.csv"), "utf8"))
  .map(row => [row.word, row]));
const key = word => word.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const part = (kind, sourceText, surfaceText) => ({ kind, sourceText, surfaceText });
const IRREGULAR = {
  are:["be","present form of be"],best:["good","irregular superlative"],came:["come","irregular past"],
  children:["child","irregular plural"],could:["can","irregular modal past"],did:["do","irregular past"],
  does:["do","irregular present"],feet:["foot","irregular plural"],
  flew:["fly","irregular past"],found:["find","irregular past"],
  grown:["grow","irregular past participle"],has:["have","irregular present"],kept:["keep","irregular past"],
  knives:["knife","irregular plural; f changes to v"],leaves:["leaf","irregular plural; f changes to v"],
  made:["make","irregular past"],mice:["mouse","irregular plural"],more:["much","irregular comparative; context review"],
  rode:["ride","irregular past"],rose:["rise","irregular past; also whole-word flower noun"],
  said:["say","irregular past"],sat:["sit","irregular past"],saw:["see","irregular past; also whole-word tool noun"],
  says:["say","irregular present"],"shan't":["shall","negative contraction"],
  teeth:["tooth","irregular plural"],was:["be","irregular past"],went:["go","irregular past"],
  were:["be","irregular past"],wolves:["wolf","irregular plural; f changes to v"],
  worse:["bad","irregular comparative; context review"],worst:["bad","irregular superlative; context review"],
};
const CONTRACTIONS = {
  "can't":["can","not"],"don't":["do","not"],"isn't":["is","not"],"won't":["will","not"],
  "i'm":["I","am"],"i've":["I","have"],"we're":["we","are"],"she's":["she","is|has"],
  "they'll":["they","will"],"let's":["let","us"],"he'd":["he","had|would"],
  "i'd":["I","had|would"],"they'd":["they","had|would"],"you'd":["you","had|would"],
};
const NONPRODUCTIVE = new Set(["align","attention","basic","chemist","community","confusion","decision",
  "definition","different","division","education","essential","extension","famous","favourite",
  "history","initial","invention","object","official","oppose","picture","politician",
  "popular","possibility","potential","receive","science","separate","station","tension",
  "unit","usually","vegetable","visible","vision","weight"]);
const WHOLE = new Set(["business","automatic","nature","history",
  "ingredient","tall","yoghurt","chin","honour","path","phone","align","actual"]);
const SOURCE_CORRECTIONS = {
  illegal:[["prefix","il"],["root","legal"]],
  incorrect:[["prefix","in"],["root","correct"]],
  irregular:[["prefix","ir"],["root","regular"]],
  dangerous:[["root","danger"],["suffix","ous"]],
  poisonous:[["root","poison"],["suffix","ous"]],
  famous:[["root","fame"],["suffix","ous"]],
  nervous:[["root","nerve"],["suffix","ous"]],
  usually:[["root","usual"],["suffix","ly"]],
  mysterious:[["root","mystery"],["suffix","ous"]],
  national:[["root","nation"],["suffix","al"]],
  natural:[["root","nature"],["suffix","al"]],
};
const SPELLING = {
  dying:["die","ing","change ie to y"],lying:["lie","ing","change ie to y"],tying:["tie","ing","change ie to y"],
  vying:["vie","ing","change ie to y"],studies:["study","es","change y to i"],
  interesting:["interest","ing","Owner-reviewed interest + ing analysis"],
};
const POS = { NN:"noun", VB:"verb", JJ:"adjective", RB:"adverb", minor:"function_word",
  encl:"contraction" };
function classCandidates(note) {
  const raw = note?.match(/\bPOS=([^;\]]+)/)?.[1] ?? "";
  return [...new Set(raw.split("|").map(value => POS[value]).filter(Boolean))].join(" | ");
}
function candidateParts(raw) {
  return [...raw.matchAll(/\b(prefix|root|base|suffix):\s*([a-z'-]+)/gi)]
    .map(match => [match[1].toLowerCase() === "base" ? "root" : match[1].toLowerCase(), match[2].toLowerCase()]);
}
function regularInflection(word, base) {
  const suffixes = ["ing","est","ed","er","es","s"];
  for (const suffix of suffixes) {
    if (!word.endsWith(suffix)) continue;
    const stem = word.slice(0,-suffix.length);
    if (stem === base || stem === base.slice(0,-1) && base.endsWith("e")
      || stem === base + base.at(-1) && /[bcdfghjklmnpqrstvwxyz]$/.test(base)
      || stem === base.slice(0,-1) + "i" && base.endsWith("y")) return suffix;
  }
  return "";
}
function allocateSurfaces(raw,target) {
  const source=raw.map(([,text])=>text).join("");
  const owners=raw.flatMap(([,text],index)=>[...text].map(()=>index));
  const dp=Array.from({length:source.length+1},()=>Array(target.length+1).fill(0));
  for(let i=0;i<=source.length;i++) dp[i][0]=i;
  for(let j=0;j<=target.length;j++) dp[0][j]=j;
  for(let i=1;i<=source.length;i++) for(let j=1;j<=target.length;j++)
    dp[i][j]=Math.min(dp[i-1][j-1]+(source[i-1]===target[j-1]?0:1),dp[i-1][j]+1,dp[i][j-1]+1);
  let i=source.length,j=target.length; const allocation=[];
  while(i>0||j>0) {
    const diagonal=i>0&&j>0?dp[i-1][j-1]+(source[i-1]===target[j-1]?0:1):Infinity;
    if(diagonal===dp[i][j]) {allocation.push([owners[i-1],target[j-1]]);i--;j--;}
    else if(i>0&&dp[i-1][j]+1===dp[i][j]) i--;
    else {allocation.push([owners[Math.max(0,i-1)]??0,target[j-1]]);j--;}
  }
  allocation.reverse();
  const surfaces=raw.map(()=>"");
  for(const [owner,char] of allocation) surfaces[owner]+=char;
  if(surfaces.join("")!==target) throw new Error(`Surface alignment failed for ${target}`);
  return surfaces;
}
function analysis(row, evidence) {
  const word = row.word;
  const raw = SOURCE_CORRECTIONS[word] ?? candidateParts(evidence.morphemes ?? "");
  let parts=[], sum="", kind="", base="", note="", priority="normal", confidence="medium", transforms=[];
  if (CONTRACTIONS[word]) {
    const [first,second] = CONTRACTIONS[word]; base=first.toLowerCase(); kind="contraction";
    const surface = word.endsWith("n't") ? word.slice(0,-3)
      : word.startsWith("let") ? "let" : word.slice(0,word.indexOf("'"));
    parts=[part("base",first,surface),part("auxiliary_contraction",second,word.slice(surface.length))];
    sum=`${first} + ${second} → ${word}`;
    transforms=[{kind:"contraction",expansion:second}];
    priority=second.includes("|") || ["won't","shan't"].includes(word) ? "high" : "normal";
    note="The apostrophe marks omitted letters; alternatives must be resolved from sentence context.";
  } else if (SPELLING[word]) {
    const [source,suffix,change]=SPELLING[word]; base=source;kind="regular_inflection";
    const stem=word.slice(0,-suffix.length);
    parts=[part("base",source,stem),part("suffix",suffix,suffix)];
    sum=`${source} + ${suffix} → ${word}`;
    transforms=[{kind:"spelling_change",source,surface:stem,description:change}];
    note=change;
  } else if (word==="potential") {
    base="poten";kind="derived";
    parts=[part("base","poten","poten"),part("suffix","ial","tial")];
    sum="poten + ial → potential";
    transforms=[{kind:"insert_t_at_suffix_boundary",underlying:"poten + ial",visible:"poten + tial"}];
    note="Owner-reviewed analysis: underlying poten + ial; visible poten + tial.";
  } else if (IRREGULAR[word]) {
    [base,note]=IRREGULAR[word]; kind="irregular_inflection";
    parts=[part("base",base,word)]; sum=`${base} → ${word}`;
    transforms=[{kind:"irregular_form",source:base,surface:word}];
    priority=note.includes("context review") || note.includes("also whole-word") ? "high" : "normal";
  } else if (["ice cream","twenty-one","well-being"].includes(word)) {
    const components=word.split(/[ -]/); kind="compound"; base=components[0];
    parts=components.map(value=>part("base",value,value)); sum=`${components.join(" + ")} → ${word}`;
    transforms=[{kind:"join",separator:word.includes("-")?"hyphen":"space"}];
  } else if (WHOLE.has(word) || raw.length===0 || raw.length===1 && raw[0][1]===word) {
    kind="free_base"; base=word; parts=[part("base",word,word)]; sum=word;
    if (raw.length>1) {priority="high";note="Whole-word candidate chosen over an uncertain historical or opaque split.";}
    else if (raw.length===0) {priority="high";note="No usable segmentation in existing metadata; whole-word candidate needs review.";}
  } else if (raw.length===1) {
    base=raw[0][1]; const suffix=regularInflection(word,base);
    if (suffix) {
      kind="regular_inflection"; const stem=word.slice(0,-suffix.length);
      parts=[part("base",base,stem),part("suffix",suffix,suffix)];
      sum=`${base} + ${suffix} → ${word}`;
      if (stem!==base) transforms=[{kind:base.endsWith("y")?"y_to_i":base.endsWith("e")?"drop_final_e":"double_final_consonant",source:base,surface:stem}];
      note="Existing MorphoLex root-only metadata omitted the visible inflection.";
    } else {
      kind="unresolved_form";parts=[part("base",base,word)];sum=`${base} → ${word}`;
      transforms=[{kind:"review_unresolved_change",source:base,surface:word}];
      priority="high";confidence="low";note="Root-only source differs from the surface word; validate the relation and spelling change.";
    }
  } else {
    const roots=raw.filter(([type])=>type==="root");base=roots[0]?.[1]??word;
    if (NONPRODUCTIVE.has(word)) {
      kind="historical_or_bound_root_review";priority="high";confidence="low";
      note="Existing metadata suggests a relation that may require bound-root or historical analysis; do not teach as a productive modern affix without review.";
    } else kind=raw.filter(([type])=>type==="root").length>1?"compound_or_combining_forms":"derived";
    if (raw.length===2 && raw[0][0]==="prefix" && raw[1][0]==="root"
      && word===raw[0][1]+raw[1][1]+"ed") raw.push(["suffix","ed"]);
    const sourceTexts=raw.map(([,text])=>text);
    sum=`${sourceTexts.join(" + ")} → ${word}`;
    if (sourceTexts.join("")===word) parts=raw.map(([type,text])=>part(type==="root"?"base":type,text,text));
    else {
      // Edit alignment is a candidate only; the source/target relationship remains review-gated.
      const surfaces=allocateSurfaces(raw,word);
      parts=raw.map(([type,text],i)=>part(type==="root"?"base":type,text,surfaces[i]));
      priority="high";confidence="low";
      note=[note,"Source morphemes do not concatenate directly to the written word; check the proposed surface alignment and spelling transformation before approval."].filter(Boolean).join(" ");
      transforms=[{kind:"editorial_alignment_candidate",source:sourceTexts.join(""),target:word}];
    }
    if (raw.some(([type,text])=>type==="root" && !canonical.has(text))) {
      priority="high";note=[note,"Base/root is absent as a standalone canonical word; review whether it is bound or a missing free base."].filter(Boolean).join(" ");
    }
  }
  if (SOURCE_CORRECTIONS[word]) note=[note,"Source segmentation corrected editorially; verify the corrected morphemes."].filter(Boolean).join(" ");
  const lexical=classCandidates(evidence.morphology_notes);
  const pos=lexical.split(" | ");
  const baseComponents=[...new Set(parts.filter(part=>part.kind==="base").map(part=>part.sourceText.toLowerCase()))];
  const familyLinks=baseComponents.map(component=>{
    const record=canonical.get(component);
    const existing=[...new Set((record?.base_family_keys??"").split(" | ").filter(Boolean))];
    const proposed=existing.length?"":component==="interest"?"interest_verb_base_family"
      :component==="poten"?"poten_root_base_family":kind==="free_base"&&pos.length===1&&pos[0]
        ?`${key(component)}_${key(pos[0])}_base_family`:"";
    const status=existing.length?"existing_family":record?"family_missing":"base_or_root_missing";
    return {component,canonicalWordKey:record?.word_key??"",existingFamilyKeys:existing,
      proposedFamilyKey:proposed,status,
      membershipAction:existing.length?"assign_word_to_existing_family":"create_family_then_assign_word"};
  });
  const familyKeys=[...new Set(familyLinks.flatMap(link=>link.existingFamilyKeys))].join(" | ");
  const familyCandidate=[...new Set(familyLinks.flatMap(link=>[...link.existingFamilyKeys,
    ...(link.proposedFamilyKey?[link.proposedFamilyKey]:[])]))].join(" | ");
  const baseKeys=familyLinks.map(link=>link.canonicalWordKey).filter(Boolean).join(" | ");
  const visibleSum=parts.length===1?parts[0].surfaceText
    :`${parts.map(part=>part.surfaceText).join(" + ")} → ${word}`;
  return {source_morphemes:evidence.morphemes??"",source_morphology_notes:evidence.morphology_notes??"",
    lexical_class_candidates:lexical,analysis_kind_candidate:kind,
    base_or_root_candidate:baseComponents.join(" | "),base_canonical_word_key:baseKeys,
    existing_base_family_keys:familyKeys,base_family_key_candidate:familyCandidate,
    base_family_links_json:JSON.stringify(familyLinks),word_sum_candidate:sum,
    visible_word_sum_candidate:visibleSum,
    morphology_parts_json:JSON.stringify(parts),morphology_joins_json:JSON.stringify([]),
    morphology_transformations_json:JSON.stringify(transforms),analysis_notes:note,
    analysis_confidence:confidence,review_priority:priority,metadata_source_name:evidence.source_name??"",
    metadata_source_url:evidence.source_url??"",proposed_action:kind==="free_base"?"review_word_sum_and_create_or_reuse_base_family":"review_morphology_then_reaudit_base_root",
    review_status:"draft",reviewed_by:"",approval_reference:""};
}
const extra=["source_morphemes","source_morphology_notes","lexical_class_candidates","analysis_kind_candidate",
  "base_or_root_candidate","base_canonical_word_key","existing_base_family_keys","base_family_key_candidate",
  "base_family_links_json","word_sum_candidate","visible_word_sum_candidate",
  "morphology_parts_json","morphology_joins_json","morphology_transformations_json",
  "analysis_notes","analysis_confidence","review_priority","metadata_source_name","metadata_source_url"];
const fields=["word_key","word","morphology_status","existing_family_keys",...extra,
  "proposed_action","review_status","reviewed_by","approval_reference"];
const rows=current.map(row=>({...row,...analysis(row,byKey.get(row.word_key))}));
if (rows.length!==886 || rows.some(row=>!row.word_sum_candidate || !row.morphology_parts_json))
  throw new Error("Incomplete morphology candidates");
writeFileSync(file,csv(fields,rows));
const twoBase=rows.filter(row=>JSON.parse(row.base_family_links_json).length===2)
  .flatMap(row=>JSON.parse(row.base_family_links_json).map((link,index)=>({
    word_key:row.word_key,word:row.word,component_ordinal:index+1,base_or_root:link.component,
    canonical_word_key:link.canonicalWordKey,existing_family_keys:link.existingFamilyKeys.join(" | "),
    proposed_family_key:link.proposedFamilyKey,family_link_status:link.status,
    membership_action:link.membershipAction,membership_status:"pending_morphology_and_family_import",
    morphology_review_status:row.review_status,
  })));
writeFileSync(resolve(root,"data/adle/homophone/convergence-v1/two-base-family-links-review.csv"),csv(
  ["word_key","word","component_ordinal","base_or_root","canonical_word_key",
    "existing_family_keys","proposed_family_key","family_link_status","membership_action",
    "membership_status","morphology_review_status"],twoBase));
const counts={}; for(const row of rows) counts[row.analysis_kind_candidate]=(counts[row.analysis_kind_candidate]??0)+1;
console.log(JSON.stringify({rows:rows.length,analysisKinds:counts,
  highPriority:rows.filter(row=>row.review_priority==="high").length,
  twoBaseWords:twoBase.length/2,twoBaseLinks:twoBase.length}));
