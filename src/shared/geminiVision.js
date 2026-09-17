const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// gemini-1.5-flash has been retired by Google (calling it now 404s).
// gemini-flash-latest is a Google-maintained alias that always points at
// their current recommended flash model, so this doesn't go stale again.
const GEMINI_MODEL = 'gemini-flash-latest';

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
        }]
      })
    }
  );

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || `Gemini request failed (${response.status})`);
  }
  const text = result.candidates[0].content.parts[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
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
