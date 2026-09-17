const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// gemini-1.5-flash has been retired by Google (calling it now 404s).
// gemini-flash-latest is a Google-maintained alias that always points at
// their current recommended flash model, so this doesn't go stale again.
const GEMINI_MODEL = 'gemini-flash-latest';

export async function getFirstAidGuidance(question) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a calm emergency first-aid assistant. Reply in the same language the user wrote in. Keep it to 2-3 short steps, no disclaimers, no preamble.\n\nQuestion: ${question}`
          }]
        }]
      })
    }
  );

  const result = await response.json();
  if (!response.ok) {
    // Surfaces the real reason (bad model name, quota, invalid key, ...) in
    // the console instead of a confusing "Cannot read properties of
    // undefined" from indexing into a response that has no `candidates`.
    throw new Error(result.error?.message || `Gemini request failed (${response.status})`);
  }
  return result.candidates[0].content.parts[0].text;
}
