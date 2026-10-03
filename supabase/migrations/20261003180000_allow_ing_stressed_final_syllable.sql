-- Align the governed -ing validator with the approved two-rule doubling lesson.
begin;

create or replace function public.adle_ing_word_valid_v1(w jsonb) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
declare rule text; base text:=w->>'base'; spelling text:=w->>'word'; expected text;
begin
  rule:=case w->>'microSkillKey' when 'D4_INF_ING_ENDINGS_REGULAR' then 'regular'
    when 'D4_INF_ING_ENDINGS_DROP_E' then 'drop_e'
    when 'D4_INF_ING_ENDINGS_DOUBLE_FINAL_CONSONANT' then 'double_final_consonant'
    when 'D4_INF_ING_ENDINGS_IE_TO_Y' then 'ie_to_y' end;
  if rule is null or coalesce(base,'')!~'^[a-z]+$' or coalesce(spelling,'')!~'^[a-z]+$'
    or coalesce(w->>'canonicalWordId','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    or w->>'rowStatus' is distinct from 'active' or w->>'reviewStatus' is distinct from 'approved_for_first_exposure'
    or nullif(btrim(w->>'reviewerRef'),'') is null or nullif(btrim(w->>'approvalRef'),'') is null
    or nullif(btrim(w->>'meaning'),'') is null or nullif(btrim(w->>'dictationSentence'),'') is null
    or w->>'audioText' is distinct from w->>'dictationSentence'
    or jsonb_typeof(w->'sourceRefs') is distinct from 'array' or jsonb_array_length(w->'sourceRefs')<1
    or exists(select 1 from jsonb_array_elements(w->'sourceRefs') ref where jsonb_typeof(ref.value)<>'string' or nullif(btrim(ref.value#>>'{}'),'') is null)
    then return false; end if;
  if rule='drop_e' and (right(base,1)<>'e' or right(base,2)='ie') then return false; end if;
  if rule='ie_to_y' and right(base,2)<>'ie' then return false; end if;
  if rule='double_final_consonant' and (
    base!~'[aeiou][b-df-hj-np-tv-z]$'
    or w->>'doublingPattern' not in ('short_cvc','stressed_final_syllable')
    or (w->>'doublingPattern'='short_cvc' and (char_length(base)>4 or char_length(regexp_replace(base,'[^aeiou]','','g'))<>1))
    or (w->>'doublingPattern'='stressed_final_syllable' and char_length(base)<=4)
  ) then return false; end if;
  expected:=case rule when 'drop_e' then left(base,-1)||'ing' when 'ie_to_y' then left(base,-2)||'ying'
    when 'double_final_consonant' then base||right(base,1)||'ing' else base||'ing' end;
  if spelling<>expected or (select count(*) from regexp_matches(lower(w->>'dictationSentence'),'\m'||spelling||'\M','g'))<>1 then return false; end if;
  return true;
exception when others then return false;
end $$;

commit;
