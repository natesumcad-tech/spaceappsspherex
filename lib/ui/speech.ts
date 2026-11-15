/** Read a line aloud with the browser's built-in voice (the campaign and the Sky Explorer tour). */
export function speak(text: string) {
  const ss = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (!ss) return;
  ss.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = ss.getVoices();
  const voice =
    voices.find((v) => v.lang.startsWith("en") && /natural|google|samantha|aria|jenny/i.test(v.name)) ?? voices.find((v) => v.lang.startsWith("en"));
  if (voice) u.voice = voice;
  u.rate = 1;
  ss.speak(u);
}

export const hush = () => {
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
};
