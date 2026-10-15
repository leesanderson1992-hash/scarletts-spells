const messages:Record<string,string>={
  TEACHING_DRAFT_ROUTE_RELEASE_REQUIRED:"Shared changes are saved for the lesson release. Open the lesson below to resolve its checks and launch.",
  TEACHING_OVERVIEW_FACTS_INCOMPLETE:"Overview is saved as a draft. Complete the required fields before approval.",
  TEACHING_OVERVIEW_REVIEW_REQUIRED:"Save and approve Overview before reviewing this lesson.",
  TEACHING_ROUTE_FACTS_INCOMPLETE:"Lesson details are saved. Complete the fields marked below before approval.",
  ADLE_LESSON_PREFLIGHT_STALE:"The word or lesson changed. Refresh and review the latest version.",
  ADLE_LESSON_WORD_REVIEW_REQUIRED:"This word's current draft needs review before it can be included in the release.",
  TEACHING_LESSON_ALREADY_RELEASED:"This reviewed lesson has already been released.",
  TEACHING_SHARED_FACTS_DEPENDENT_ROUTE_RELEASE_REQUIRED:"Shared changes also affect another active profile. Review its release checks before launching.",
};
export const workspaceErrorMessage=(code:string)=>messages[code]??code.toLowerCase().replaceAll("_"," ");
