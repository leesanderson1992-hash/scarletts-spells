import type { SupabaseClient } from "@supabase/supabase-js";
import type { SkillProficiencyReport } from "@/lib/adle/micro-skill-proficiency";
import { loadAuthenticUseControl } from "@/lib/authentic-use/review";

/** Read authoritative saved reports; never derive levels from reward totals. */
export async function AuthenticUseProgress({ client, childId, parentUserId }: {
  client: SupabaseClient; childId: string; parentUserId: string;
}) {
  const control = await loadAuthenticUseControl(client, parentUserId, childId);
  if (control.mode !== "enabled") return null;
  const [reports, health, names] = await Promise.all([
    client.from("authentic_use_current_proficiency").select("micro_skill_key,report,prior_report,policy_version,source_credit_ids")
      .eq("child_id", childId).eq("parent_user_id", parentUserId),
    client.from("authentic_use_delivery_health").select("consumer,status,delivery_count")
      .eq("child_id", childId).eq("parent_user_id", parentUserId),
    client.from("micro_skill_catalog").select("micro_skill_key,display_name").eq("is_active", true),
  ]);
  if (reports.error || health.error || names.error) return <p role="status">Verified writing progress is temporarily unavailable.</p>;
  const labels = new Map(names.data.map(row => [row.micro_skill_key, row.display_name]));
  const pending = health.data.filter(row => ["pending", "processing", "failed"].includes(row.status)).reduce((sum, row) => sum + Number(row.delivery_count), 0);
  return <section className="brand-card rounded-3xl p-4 md:p-5">
    <h2 className="text-lg font-semibold">Progress from verified writing</h2>
    <p className="mt-2 text-sm">Each word counts once in the original submission. Gold and skill progress have their own eligibility checks.</p>
    {pending > 0 ? <p className="mt-2 text-sm" role="status">{pending} progress updates are waiting to finish. Your verified writing is saved.</p> : null}
    {!reports.data.length ? <p className="mt-2 text-sm">Skill progress will appear when your verified words have eligible skill mappings.</p> : <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead><tr><th scope="col" className="p-2">Skill</th><th scope="col" className="p-2">Secure level</th><th scope="col" className="p-2">Developing</th><th scope="col" className="p-2">Why</th></tr></thead>
        <tbody>{reports.data.map(row => {
          const report = row.report as SkillProficiencyReport;
          const prior = row.prior_report as SkillProficiencyReport | null;
          const developing = report.levels.find(level => level.level === report.developingLevel);
          return <tr key={row.micro_skill_key} className="border-t border-[var(--border)]">
            <td className="p-2">{labels.get(row.micro_skill_key) ?? row.micro_skill_key}</td>
            <td className="p-2">{report.highestSecureLevel ?? "Building foundations"}</td>
            <td className="p-2">{developing ? `Level ${developing.level} · ${Math.round((developing.progress ?? 0) * 100)}%` : "—"}</td>
            <td className="p-2"><details><summary className="cursor-pointer">View evidence</summary>
              <p>{row.source_credit_ids.length} verified word uses. Previous secure level: {prior?.highestSecureLevel ?? "none"}.</p>
              {report.explanation.map((line, index) => <p key={index}>{line}</p>)}
            </details></td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
  </section>;
}
