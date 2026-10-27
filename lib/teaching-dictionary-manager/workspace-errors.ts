const messages:Record<string,string>={
  TEACHING_DRAFT_ROUTE_RELEASE_REQUIRED:"Your change was saved in a draft, but it is not yet in the live dictionary. This word has an active lesson relationship, so its shared facts require a reviewed lesson release. Reopen the saved draft to keep editing; complete the lesson checks before publication.",
  TEACHING_OVERVIEW_FACTS_INCOMPLETE:"Overview is saved as a draft. Complete the required fields before approval.",
  TEACHING_OVERVIEW_REVIEW_REQUIRED:"The new draft was saved. Review its Overview above, then select Save and approve. After that, approve the lesson details.",
  TEACHING_ROUTE_FACTS_INCOMPLETE:"Lesson details are saved. Complete the fields marked below before approval.",
  ADLE_LESSON_PREFLIGHT_STALE:"The word or lesson changed. Refresh and review the latest version.",
  ADLE_LESSON_WORD_REVIEW_REQUIRED:"This word's current draft needs review before it can be included in the release.",
  TEACHING_LESSON_ALREADY_RELEASED:"This reviewed lesson has already been released.",
  TEACHING_SHARED_FACTS_DEPENDENT_ROUTE_RELEASE_REQUIRED:"Shared changes also affect another active profile. Review its release checks before launching.",
  TEACHING_POS_REVIEW_INVALID:"Choose a part of speech and explain the correction before approving it.",
  TEACHING_POS_SOURCE_CHANGED:"The live word changed while you were reviewing it. Reload and check the latest version.",
  TEACHING_POS_FAMILY_REVIEW_REQUIRED:"This word has a family relationship that needs review before its part of speech can change.",
  TEACHING_POS_ALREADY_APPROVED:"That part of speech is already live in the dictionary.",
  TEACHING_POS_REVIEW_FAILED:"The part of speech could not be approved. Reload and try again.",
};
export const workspaceErrorMessage=(code:string)=>messages[code]??code.toLowerCase().replaceAll("_"," ");
