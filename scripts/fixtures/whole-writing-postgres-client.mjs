/** Test transport only: the actual worker executes against disposable PostgreSQL.
 * This deliberately implements only its small PostgREST query surface.
 */
const tables = new Set(["writing_source_snapshots","writing_shadow_controls","canonical_teaching_dictionary_words",
  "writing_shadow_run_enrichment_scopes","writing_shadow_run_occurrences","writing_occurrences","children",
  "writing_shadow_current_occurrence_report","writing_shadow_projection_batches","writing_occurrence_interpretations",
  "writing_shadow_occurrence_skill_candidates","writing_shadow_skill_evidence_projections","micro_skill_catalog"]);
const rpcArguments = {
  schedule_writing_enrichment_replays:["p_limit"],
  claim_writing_shadow_runs:["p_limit"],
  persist_writing_shadow_result:["p_run_id","p_lease_token","p_result"],
  persist_writing_shadow_result_with_known_errors:["p_run_id","p_lease_token","p_result"],
  materialize_writing_known_error_review_candidates:["p_limit"],
  finish_writing_shadow_run:["p_run_id","p_lease_token","p_result","p_error_code"],
};
const identifier = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error("Unexpected proof query identifier");
  return `"${value}"`;
};
export function postgresWorkerClient(db) {
  let queryQueue=Promise.resolve();
  const query=(sql,values=[])=>{
    const pending=queryQueue.then(()=>db.query(sql,values));
    queryQueue=pending.catch(()=>undefined);
    return pending;
  };
  return {
    async rpc(name, args) {
      const keys = rpcArguments[name];
      if (!keys) throw new Error("Unexpected proof RPC");
      try {
        const result = await query(`select * from ${identifier(name)}(${keys.map((_,i) => `$${i+1}`).join(",")})`,keys.map((key) => args[key]));
        return { data:name==="claim_writing_shadow_runs" ? result.rows : result.rows[0]?.[name],error:null };
      } catch (error) { return { data:null,error:{code:error.code,message:error.message} }; }
    },
    from(table) {
      if (!tables.has(table)) throw new Error("Unexpected worker table access");
      let columns="*",order="",offset=0,limit=null,one=false;
      const predicates=[],values=[];
      const builder = {
        select(value) { columns=value==="*" ? "*" : value.split(",").map((v) => identifier(v.trim())).join(","); return builder; },
        eq(key,value) { values.push(value); predicates.push(`${identifier(key)}=$${values.length}`); return builder; },
        in(key,value) { values.push(value); predicates.push(`${identifier(key)}=any($${values.length})`); return builder; },
        order(key) { order=` order by ${identifier(key)}`; return builder; },
        limit(value) { limit=value; return builder; },
        range(start,end) { offset=start; limit=end-start+1; return builder; },
        single() { one=true; return builder; },
        maybeSingle() { one=true; return builder; },
        async then(resolve) {
          try {
            const result=await query(`select ${columns} from ${identifier(table)}${predicates.length ? ` where ${predicates.join(" and ")}` : ""}${order}${limit===null ? "" : ` limit ${limit} offset ${offset}`}`,values);
            return resolve({data:one ? result.rows[0] : result.rows,error:null});
          } catch (error) { return resolve({data:null,error:{code:error.code,message:error.message}}); }
        },
      };
      return builder;
    },
  };
}
