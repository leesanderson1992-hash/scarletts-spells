import "server-only";
import {createHash} from "node:crypto";
import type {createServiceRoleClient} from "@/lib/supabase/service-role";
import {loadCanonicalLatinRootFacts} from "@/lib/adle/loaders/latin-root-canonical-loader";
import {buildLatinRootReleasePackage,latinRootDictionaryProjection,latinRootTeachingAuthority} from "@/lib/adle/morphology/latin-root-release";
import {fingerprintSnapshotValue} from "@/lib/adle/composable-lesson/canonical-fingerprint";
import {latinRootReviewIssues,latinRootSpellingReviewEligible,LATIN_ROOT_REVIEW_SKILL,LATIN_ROOT_REVIEW_ROUTE} from "./latin-root-review";
import {loadReviewedMeaningBundles} from "./multi-sense-export";
import type {MultiSenseCsvBundle} from "./multi-sense-csv";
import {ingReviewEnvironment} from "./ing-staging-scope";
import {prefillWorkbookParts} from "./review-workbook-part-prefill";
type Db=ReturnType<typeof createServiceRoleClient>;
export async function loadLatinRootBulkReview(db:Db) {
 const environment=ingReviewEnvironment();if(!environment)throw Error("Latin root review is unavailable in this environment.");
 const [roots,associations,requests,head,bindings,decisions,exclusions]=await Promise.all([
  db.from("teaching_dictionary_root_skill_families").select("family_key,root_text,origin_language").eq("micro_skill_key",LATIN_ROOT_REVIEW_SKILL),
  db.from("teaching_dictionary_root_language_assignments").select("canonical_word_id,sense_id,family_key").eq("micro_skill_key",LATIN_ROOT_REVIEW_SKILL).eq("assignment_role","family_member"),
  db.from("teaching_dictionary_lesson_review_requests").select("canonical_word_id,sense_id").eq("environment_key",environment).eq("micro_skill_key",LATIN_ROOT_REVIEW_SKILL).order("requested_at",{ascending:true}),
  db.from("adle_route_activation_heads").select("current_revision_id").eq("environment_key",environment).eq("route_id",LATIN_ROOT_REVIEW_ROUTE).eq("route_version","v1").eq("micro_skill_key",LATIN_ROOT_REVIEW_SKILL).maybeSingle(),
  db.from("teaching_dictionary_effective_lesson_sense_bindings").select("canonical_word_id,sense_id").eq("environment_key",environment).eq("micro_skill_key",LATIN_ROOT_REVIEW_SKILL),
  db.from("teaching_dictionary_pair_latest_decisions").select("canonical_word_id,action").eq("environment_key",environment).eq("micro_skill_key",LATIN_ROOT_REVIEW_SKILL),
  db.from("teaching_dictionary_bulk_review_exclusions").select("canonical_word_id").eq("environment_key",environment).eq("micro_skill_key",LATIN_ROOT_REVIEW_SKILL),
 ]);
 for(const result of [roots,associations,requests,head,bindings,decisions,exclusions])if(result.error)throw Error("Could not read the Latin root review queue.");
 if([roots,associations,requests,bindings,decisions,exclusions].some(r=>(r.data?.length??0)>=1000))throw Error("The Latin root review queue needs pagination before exporting more words.");
 const facts=latinRootDictionaryProjection(await loadCanonicalLatinRootFacts(db,roots.data!.map(r=>r.family_key)));
 const ids=[...new Set([...associations.data!.map(r=>r.canonical_word_id),...requests.data!.map(r=>r.canonical_word_id),...facts.words.map(w=>w.canonicalWordId)])];
 const wordRows=ids.length?await db.from("canonical_teaching_dictionary_words").select("id,display_word,review_status").in("id",ids).eq("row_status","active").eq("dialect_code","en-GB"): {data:[],error:null};
 if(wordRows.error)throw Error("Could not read the existing Latin root dictionary words.");
 const reviewed=await loadReviewedMeaningBundles(db,ids);
 const bundles:MultiSenseCsvBundle[]=wordRows.data!.filter(w=>w.review_status==="approved_for_first_exposure").map(w=>reviewed.find(b=>b.wordId===w.id)??{
  wordId:w.id,displayWord:w.display_word,sourceSenseReviewedAt:"",senseSet:{pronunciations:[{id:"british-1",ipa:"",spokenSyllableCount:null,stressPattern:""}],senses:[{id:"review",definition:"",partOfSpeech:"",pronunciationId:"british-1"}]},analyses:[]}).filter(bundle=>latinRootSpellingReviewEligible(bundle,facts.families,new Set(facts.words.map(w=>w.canonicalWordId)))&&!requests.data!.some(r=>r.canonical_word_id===bundle.wordId&&bundle.senseSet.senses.some(s=>s.id===r.sense_id&&s.partOfSpeech==="root")&&!associations.data!.some(a=>a.canonical_word_id===bundle.wordId)));
 const senseIds=new Map<string,string>();for(const row of bindings.data!){const old=senseIds.get(row.canonical_word_id);if(old&&old!==row.sense_id)throw Error("A Latin root word has conflicting teaching meanings.");senseIds.set(row.canonical_word_id,row.sense_id);}
 const requested=new Map(requests.data!.filter(r=>r.sense_id).map(r=>[r.canonical_word_id,r.sense_id as string]));
 const vetoed=new Set([...decisions.data!.filter(d=>d.action==="deassign").map(r=>r.canonical_word_id),...exclusions.data!.map(r=>r.canonical_word_id)]);
 let headStatus="";let currentReleaseKey="";
 let publishedWords:{canonicalWordId:string;senseId:string;sourceFingerprint:string}[]=[];let publishedDictionary:{words:typeof facts.words}|null=null;
 if(head.data){const revision=await db.from("adle_route_activation_revisions").select("release_manifest_id,activation_status").eq("id",head.data.current_revision_id).single();if(revision.error)throw Error("Could not read the active Latin release.");
  headStatus=revision.data.activation_status;const manifest=await db.from("adle_curriculum_release_manifests").select("release_key").eq("id",revision.data.release_manifest_id).single();if(manifest.error)throw Error("Could not read the Latin release identity.");currentReleaseKey=manifest.data.release_key;
  const dependency=await db.from("adle_curriculum_release_dependencies").select("authority_id").eq("release_manifest_id",revision.data.release_manifest_id).eq("micro_skill_key",LATIN_ROOT_REVIEW_SKILL).eq("authority_type","teaching_dictionary_closure").single();if(dependency.error)throw Error("Could not read the published Latin words.");
  const authority=await db.from("adle_curriculum_dependency_authorities").select("semantic_projection").eq("id",dependency.data.authority_id).single();if(authority.error)throw Error("Could not read the published Latin word facts.");publishedDictionary=authority.data.semantic_projection.dictionary;
  publishedWords=publishedDictionary!.words.map(w=>({canonicalWordId:w.canonicalWordId,senseId:w.senseId,sourceFingerprint:fingerprintSnapshotValue(w)}));
 }
 const rows=bundles.map(bundle=>{const choice=senseIds.get(bundle.wordId)??requested.get(bundle.wordId)??(bundle.senseSet.senses.length===1?bundle.senseSet.senses[0].id:undefined);
  const issues=latinRootReviewIssues(bundle,choice,facts.families);if(bundle.senseSet.senses.length>1&&!senseIds.has(bundle.wordId))issues.push("Approve the selected teaching meaning before publishing this multi-meaning word.");if(vetoed.has(bundle.wordId))issues.push("Excluded or deassigned. Explicitly approve this word again before publishing it.");
  const word=facts.words.find(w=>w.canonicalWordId===bundle.wordId&&w.senseId===choice);
  const family=word?facts.families.find(f=>f.familyKey===word.familyKey):facts.families.find(f=>associations.data!.some(a=>a.canonical_word_id===bundle.wordId&&a.family_key===f.familyKey));
  const active=Boolean(!vetoed.has(bundle.wordId)&&word&&publishedWords.some(w=>w.canonicalWordId===word.canonicalWordId&&w.senseId===word.senseId&&w.sourceFingerprint===fingerprintSnapshotValue(word)));
  return {id:bundle.wordId,word:bundle.displayWord,senseId:choice,familyKey:word?.familyKey??family?.familyKey,root:family?.root??"",origin:family?.origin??"",rootMeaning:family?.meaning??"",issues,ready:!issues.length,active,href:`/admin/teaching-dictionary/${bundle.wordId}#td-overview`,note:issues.join(" ")|| (active?"Published in ADLE.":"Reviewed facts complete; preview family readiness and publish.")};
 }).sort((a,b)=>a.root.localeCompare(b.root)||a.word.localeCompare(b.word));
 const current=rows.filter(r=>r.active).map(r=>{const w=facts.words.find(w=>w.canonicalWordId===r.id&&w.senseId===r.senseId)!;return {canonicalWordId:r.id,word:r.word,base:r.root,meaning:w.definition,dictationSentence:w.sentence};});
 const familySummary=facts.families.map(f=>({root:f.root,meaning:f.meaning,origin:f.origin,familyKey:f.familyKey,candidates:rows.filter(r=>r.familyKey===f.familyKey).length,ready:rows.filter(r=>r.familyKey===f.familyKey&&r.ready).length}));
 return {environment,facts,bundles,rows,current,familySummary,senseIds,vetoed,headId:head.data?.current_revision_id??null,headStatus,currentReleaseKey,title:"Common Latin roots",routeId:LATIN_ROOT_REVIEW_ROUTE,skill:LATIN_ROOT_REVIEW_SKILL};
}
export async function latinRootWorkbookData(db:Db){const review=await loadLatinRootBulkReview(db);const families=new Map(review.facts.families.map(f=>[f.root,[`${f.root} — ${f.meaning} (Latin root) | ${f.familyKey}`]]));
 const wordPartPrefills=new Map(review.bundles.flatMap(b=>b.senseSet.senses.map(s=>{const a=b.analyses.find(a=>a.senseId===s.id);return [`${b.wordId}:${s.id}`,prefillWorkbookParts({word:b.displayWord,definition:s.definition,parts:a?.parts,joins:a?.joins,transformations:a?.transformations})] as const;})));
 return {...review,bundles:[...review.bundles].sort((a,b)=>review.rows.findIndex(r=>r.id===a.wordId)-review.rows.findIndex(r=>r.id===b.wordId)),families,wordPartPrefills,rootFamilyOptions:[...families.values()].flat(),notes:new Map(review.rows.map(r=>[r.id,r.note])),rootReviewFacts:new Map(review.rows.map(r=>[r.id,{root:r.root,origin:r.origin,meaning:r.rootMeaning}])),requestedSenses:new Map(review.rows.filter(r=>r.active).map(r=>[r.id,r.senseId!]))};}
export async function prepareLatinRootBulkPublication(db:Db){const review=await loadLatinRootBulkReview(db);
 const ready=review.rows.filter(r=>r.ready);const familyKeys=new Set(review.familySummary.filter(f=>f.ready>=2).map(f=>f.familyKey));
 const selected=ready.filter(r=>r.familyKey&&familyKeys.has(r.familyKey));const pairs=new Set(selected.map(r=>`${r.id}:${r.senseId}`));
 const dictionary=latinRootDictionaryProjection({families:review.facts.families.filter(f=>familyKeys.has(f.familyKey)),words:review.facts.words.filter(w=>pairs.has(`${w.canonicalWordId}:${w.senseId}`))});
 if(review.headStatus!=="enabled")return {...review,publication:null,publicationError:"The Latin root route must already be enabled before this workflow can publish an update."};
 if(!dictionary.families.length||dictionary.words.length<5||dictionary.families.map(f=>dictionary.words.filter(w=>w.familyKey===f.familyKey).length).sort((a,b)=>b-a).slice(0,2).reduce((a,b)=>a+b,0)<5)return {...review,publication:null,publicationError:"At least five reviewed words across one or two families are needed. Each participating family needs at least two words."};
 const teachingSenseBindings=Object.fromEntries(dictionary.words.map(w=>[w.canonicalWordId,w.senseId]));
 const fingerprint=fingerprintSnapshotValue({dictionary,teachingSenseBindings,teaching:latinRootTeachingAuthority()});
 const pkg=buildLatinRootReleasePackage({releaseKey:`latin_roots_bulk_v1_${fingerprint.slice(0,20)}`,approvalRefs:[`Teaching Dictionary Latin roots bulk review ${fingerprint}`],...dictionary,selectionMode:"reviewed_subset",reviewEnvironment:review.environment,teachingSenseBindings});
 return {...review,publication:{pkg,previewHash:fingerprintSnapshotValue(pkg),wordCount:dictionary.words.length,familyCount:dictionary.families.length},publicationError:null};}
export async function publishLatinRootBulkReview(db:Db,actorId:string,previewHash:string,headId:string|null){const prepared=await prepareLatinRootBulkPublication(db);
 if(prepared.publication&&prepared.publication.previewHash===previewHash&&prepared.currentReleaseKey===prepared.publication.pkg.manifest.releaseKey)return prepared.publication;
 if(!prepared.publication||prepared.publication.previewHash!==previewHash||prepared.headId!==headId)throw Error("The dictionary or release changed. Open Preview again before publishing.");
 const pkg=prepared.publication.pkg;const result=await db.rpc("publish_adle_latin_root_bulk_review_v1",{p_package:pkg,p_package_file_sha256:createHash("sha256").update(JSON.stringify(pkg)).digest("hex"),p_environment:prepared.environment,p_expected_head:headId,p_actor:actorId});if(result.error)throw Error(result.error.message);
 return prepared.publication;
}
