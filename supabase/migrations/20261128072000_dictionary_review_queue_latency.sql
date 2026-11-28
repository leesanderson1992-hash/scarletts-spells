begin;
-- The word editor calls this queue after saves as well as on initial load.
-- Planning its nested editorial/root views with LLVM JIT costs substantially
-- more than executing this short, indexed read. Keep the exact queue semantics
-- and privileges; bound the latency by disabling JIT only inside this function.
alter function public.teaching_dictionary_lesson_review_queue(text,text,uuid)
  set jit=off;
notify pgrst,'reload schema';
commit;
