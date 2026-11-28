import assert from "node:assert/strict";
import type {SupabaseClient} from "@supabase/supabase-js";
import {loadWordBaseFamilies,loadWordBaseFamiliesForEditor}from"../lib/teaching-dictionary-manager/base-family-summary";
const broken={rpc:()=>Promise.resolve({data:null,error:{code:'57014'}}),from:()=>({select(){return this;},eq(){return Promise.resolve({data:null,error:{code:'57014'}});}})} as unknown as SupabaseClient;
const captured:unknown[]=[];const warn=console.warn;console.warn=(...args)=>{captured.push(args);};
try{const editor=await loadWordBaseFamiliesForEditor(broken,'00000000-0000-4000-8000-000000000001');assert(editor.unavailable);assert.deepEqual(editor.families,[]);assert(captured.length===1);await assert.rejects(()=>loadWordBaseFamilies(broken,'00000000-0000-4000-8000-000000000001'),/TEACHING_FAMILY_SUMMARY_READ_FAILED/);}finally{console.warn=warn;}
console.log('PASS: an unavailable family read is explicit in the editor while strict consumers remain fail-closed.');
