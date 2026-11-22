export const STRESS_OPTIONS = [
  {value:'primary',label:'Stressed (primary)'},
  {value:'secondary',label:'Lighter stress (secondary)'},
  {value:'unstressed',label:'Unstressed'},
] as const;

/** Convert equivalent historical labels only; never infer missing stress positions. */
export function normaliseStressPattern(value: string, syllables: number | null): string {
  const tokens = value.trim().toLowerCase().split('-').map(token => token.trim());
  if (syllables === 1 && tokens.length === 1 && tokens[0] === 'single') return 'primary';
  return tokens.map(token => token === 'stressed' ? 'primary' : token).join('-');
}

export function resizeStressPattern(value: string, syllables: number): string {
  const tokens = normaliseStressPattern(value, syllables).split('-');
  return Array.from({length:syllables},(_,index)=>tokens[index] ?? '').join('-');
}

export function stressPatternErrors(value: string, syllables: number | null): string[] {
  if (!syllables || !value.trim()) return [];
  const tokens = normaliseStressPattern(value, syllables).split('-');
  const errors: string[] = [];
  if (tokens.length !== syllables)
    errors.push(`Stress pattern has ${tokens.length} positions for ${syllables} spoken ${syllables === 1 ? 'syllable' : 'syllables'}. Choose one stress value per syllable.`);
  const unknown = [...new Set(tokens.filter(token => !STRESS_OPTIONS.some(option=>option.value===token)))];
  if (unknown.length)
    errors.push(`Stress pattern ${unknown.some(token=>!token) ? 'has an empty position' : `uses an unrecognised label (${unknown.join(', ')})`}. Choose primary, secondary or unstressed for each syllable.`);
  return errors;
}
