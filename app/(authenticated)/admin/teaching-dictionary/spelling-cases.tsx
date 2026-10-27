import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { openNoSkillCasesForWord } from "@/lib/admin/no-matching-skill-cases";
import { createOrLinkMicroSkill } from "../no-matching-skill/actions";

type Skill = { micro_skill_key: string; display_name: string };

/** The existing governed case transaction remains the only approval writer. */
export async function SpellingCasesForWord({ wordId, normalisedWord, skills }: {
  wordId: string;
  normalisedWord: string;
  skills: Skill[];
}) {
  const cases = await openNoSkillCasesForWord(createServiceRoleClient(), wordId, normalisedWord);
  if (!cases.length) return null;
  const availableSkills = skills.filter((skill) => skill.micro_skill_key.startsWith("D4_"));
  return <section className="rounded-2xl border border-[var(--border)] bg-white p-5" aria-labelledby="td-spelling-cases">
    <h2 id="td-spelling-cases" className="text-lg font-semibold">Spelling cases awaiting a skill decision</h2>
    <p className="mt-1 text-sm text-[color:var(--mid)]">The dictionary word exists. Review the child&apos;s exact spelling before linking a skill. Completing lesson content alone does not decide what caused a misspelling.</p>
    <div className="mt-4 grid gap-3">{cases.map((item) => {
      const contextOnly = item.source_type === "parent_context" || item.observed_is_valid_word;
      return <form key={item.queue_id} action={createOrLinkMicroSkill} className="grid gap-3 rounded-lg border border-[var(--border)] p-3 text-sm">
        <input type="hidden" name="queue_id" value={item.queue_id} />
        <input type="hidden" name="return_word_id" value={wordId} />
        <input type="hidden" name="mode" value="existing" />
        <div><strong>{item.misspelling} → {item.correction}</strong><p className="text-xs text-[color:var(--mid)]">{item.source_type.replaceAll("_", " ")} · original evidence retained after review</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">Error type
            <select name="classification" defaultValue={contextOnly ? "context" : "spelling"} className="rounded border border-[var(--border)] bg-white px-2 py-2">
              <option value="spelling" disabled={contextOnly}>Genuine misspelling</option>
              <option value="context">Contextual word choice</option>
            </select>
          </label>
          <label className="grid gap-1">Micro-skill
            <select name="micro_skill_key" defaultValue="" required className="rounded border border-[var(--border)] bg-white px-2 py-2">
              <option value="">Choose the reviewed skill</option>
              {availableSkills.map((skill) => <option key={skill.micro_skill_key} value={skill.micro_skill_key}>{skill.display_name}</option>)}
            </select>
          </label>
        </div>
        <label className="grid gap-1">Full contrast set, if this is a contextual choice
          <input name="members" defaultValue={`${item.misspelling}, ${item.correction}`} className="rounded border border-[var(--border)] px-2 py-2" />
          <span className="text-xs text-[color:var(--mid)]">For a homophone skill, enter every member of its approved set. The existing review checks this before linking.</span>
        </label>
        <div><button type="submit" className="rounded bg-[var(--scarlett)] px-3 py-2 font-semibold text-white">Approve this exact pair and skill</button></div>
      </form>;
    })}</div>
  </section>;
}
