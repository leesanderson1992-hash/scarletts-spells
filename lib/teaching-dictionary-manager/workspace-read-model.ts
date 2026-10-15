import { routeContentFromStoredRow, type RouteContentDraft } from "./contracts";
import { nativeWordFacts } from "./native-word-facts";
import type { LessonReadinessRow } from "./lesson-preflight";

export function wordRoutesFromPreflights(preflights: LessonReadinessRow[], wordId: string, wordSum: string): RouteContentDraft[] {
  const routeContents: RouteContentDraft[] = [];
  for (const lesson of preflights) {
    const member = lesson.words.find(
      (entry) => entry.id === wordId && entry.requiredForRelease !== false,
    );
    if (
      !member ||
      routeContents.some(
        (content) => content.microSkillKey === lesson.microSkillKey,
      )
    )
      continue;
    const preview = member.contentPreview as {
      routeContent?: Record<string, unknown>;
    };
    const raw = preview.routeContent;
    if (!raw) {
      const native = nativeWordFacts(
        lesson.routeId,
        lesson.routeVersion,
        lesson.microSkillKey,
        wordId!,
        lesson.releaseContentPreview,
      );
      if (native) routeContents.push(native);
      continue;
    }
    if (raw.content && typeof raw.content === "object") {
      routeContents.push(
        routeContentFromStoredRow({
          route_id: lesson.routeId,
          route_version: lesson.routeVersion,
          micro_skill_key: lesson.microSkillKey,
          content: raw,
        }),
      );
      continue;
    }
    const facts = Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [
        key.replace(/_([a-z])/g, (_match, c: string) => c.toUpperCase()),
        value,
      ]),
    );
    routeContents.push({
      routeId: lesson.routeId,
      routeVersion: lesson.routeVersion,
      microSkillKey: lesson.microSkillKey,
      wordMeaning: String(
        raw.new_word_meaning ?? raw.child_friendly_meaning ?? "",
      ),
      wordSum: wordSum,
      content: facts,
    });
  }
  return routeContents;
}
