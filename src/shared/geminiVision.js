const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// gemini-1.5-flash has been retired by Google (calling it now 404s).
// gemini-flash-latest is a Google-maintained alias that always points at
// their current recommended flash model, so this doesn't go stale again.
const GEMINI_MODEL = 'gemini-flash-latest';

// If the "latest" alias's shared pool is overloaded, fall back to a
// specific, pinned model — a distinct deployment with its own capacity,
// not just another shot at the same busy pool. Verified live against this
// project's API key before picking it (older pinned models, e.g.
// gemini-2.5-flash, 404 as "no longer available to new users").
const GEMINI_FALLBACK_MODEL = 'gemini-3.6-flash';

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

// Gemini's shared flash tier occasionally answers with 503 ("high demand")
// or 429 (rate limited) — both are transient load issues on Google's side,
// not a problem with the request, and very often succeed a few seconds
// later. Worth a couple of quick retries per model before falling back to
// a different model entirely, and only giving up once both are exhausted.
const MAX_ATTEMPTS_PER_MODEL = 2;
const RETRY_DELAY_MS = 1200;
const RETRYABLE_STATUSES = [429, 503];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function analyzeAccidentPhoto(photoFile) {
  const base64Photo = await fileToBase64(photoFile);
  const models = [GEMINI_MODEL, GEMINI_FALLBACK_MODEL];

  let lastErr;
  for (let m = 0; m < models.length; m++) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt++) {
      try {
        return await requestAnalysis(models[m], base64Photo, photoFile.type);
      } catch (err) {
        lastErr = err;
        // A non-transient error (safety block, bad request) won't be fixed
        // by retrying or switching models — surface it immediately.
        if (err.code !== 'SERVICE_UNAVAILABLE') throw err;

        const isLastAttemptOnThisModel = attempt === MAX_ATTEMPTS_PER_MODEL;
        const isLastModel = m === models.length - 1;
        if (isLastAttemptOnThisModel && isLastModel) throw err;
        // Retrying the same still-overloaded model benefits from a short
        // pause; moving on to a fresh model doesn't need one.
        if (!isLastAttemptOnThisModel) await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }
  throw lastErr;
}

async function requestAnalysis(model, base64Photo, mimeType) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: 'Look at this accident photo. Reply ONLY with JSON, no other text: {"severity": <number 0-100>, "genuine": "<yes|no|uncertain>", "summary": "<one short sentence>"}'
            },
            { inlineData: { mimeType, data: base64Photo } }
          ]
        }],
        safetySettings: SAFETY_SETTINGS,
      })
    }
  );

  const result = await response.json();
  if (!response.ok) {
    const err = new Error(result.error?.message || `Gemini request failed (${response.status})`);
    if (RETRYABLE_STATUSES.includes(response.status)) err.code = 'SERVICE_UNAVAILABLE';
    throw err;
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
