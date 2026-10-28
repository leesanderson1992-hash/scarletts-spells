/** Frozen lesson marker for a device-voice recording substitute. */
export const DEVICE_SPEECH_PREFIX = "device-speech:";

export function deviceSpeechSource(text: string): string {
  return `${DEVICE_SPEECH_PREFIX}${encodeURIComponent(text)}`;
}

export function isDeviceSpeechSource(src: unknown): src is string {
  return typeof src === "string" && src.startsWith(DEVICE_SPEECH_PREFIX) &&
    src.length > DEVICE_SPEECH_PREFIX.length;
}

export function isWeakVowelAudioSource(src: unknown): src is string {
  return typeof src === "string" && (src.startsWith("/audio/") || isDeviceSpeechSource(src));
}

export function needsPronunciationImprovement(src: unknown): boolean {
  return isDeviceSpeechSource(src);
}
