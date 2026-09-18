const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// gemini-1.5-flash has been retired by Google (calling it now 404s).
// gemini-flash-latest is a Google-maintained alias that always points at
// their current recommended flash model, so this doesn't go stale again.
const GEMINI_MODEL = 'gemini-flash-latest';

// Google's default safety thresholds are tuned for general-purpose chat and
// can refuse or hard-block genuinely severe accident photos (visible blood,
// trauma) — exactly the images this feature most needs to score high
// severity on. Relaxed one notch for this narrow, legitimate medical-triage
// use case (a single accident photo, not open-ended generation).
const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
];

export async function analyzeAccidentPhoto(photoFile) {
  const base64Photo = await fileToBase64(photoFile);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: 'Look at this accident photo. Reply ONLY with JSON, no other text: {"severity": <number 0-100>, "genuine": "<yes|no|uncertain>", "summary": "<one short sentence>"}'
            },
            { inlineData: { mimeType: photoFile.type, data: base64Photo } }
          ]
        }],
        safetySettings: SAFETY_SETTINGS,
      })
    }
  );

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || `Gemini request failed (${response.status})`);
  }

  // A hard safety block (no candidate at all, result.promptFeedback.blockReason
  // set instead) or a soft refusal (a candidate exists but finishReason isn't
  // STOP, or its text is prose instead of the requested JSON) both leave
  // nothing usable to parse. Both are tagged with the same error code so the
  // caller can tell "Gemini declined this photo" apart from a plain network/
  // API failure, rather than crashing on `undefined`/`null` access.
  const candidate = result.candidates?.[0];
  const blockReason =
    result.promptFeedback?.blockReason || (candidate && candidate.finishReason !== 'STOP' ? candidate.finishReason : null);

  if (!candidate || !candidate.content?.parts?.length || blockReason) {
    const err = new Error(`Gemini declined to analyze this photo (${blockReason || 'no candidate returned'})`);
    err.code = 'SAFETY_BLOCKED';
    throw err;
  }

  const text = candidate.content.parts[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    const err = new Error('Gemini replied without the requested JSON, likely a declined analysis');
    err.code = 'SAFETY_BLOCKED';
    throw err;
  }
  return JSON.parse(jsonMatch[0]);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
