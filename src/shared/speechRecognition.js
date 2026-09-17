export function listenForSOS(onTrigger, onError) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    onError('Voice recognition is not supported in this browser');
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  // Whichever of onresult/onerror/onend fires first "wins" and reports back
  // to the caller exactly once — the rest are no-ops.
  let settled = false;

  recognition.onresult = (event) => {
    settled = true;
    const transcript = event.results[0][0].transcript.toLowerCase();
    const keywords = ['emergency', 'help', 'sos', 'accident'];
    if (keywords.some((word) => transcript.includes(word))) {
      onTrigger(transcript);
    } else {
      onError(`Heard "${transcript}" — no emergency keyword detected`);
    }
  };

  recognition.onerror = (event) => {
    settled = true;
    onError(event.error);
  };

  // Many browsers end a `continuous: false` session on silence/timeout
  // without ever firing onresult or onerror. Without this, the caller's
  // "listening…" state would be stuck forever after one silent attempt.
  recognition.onend = () => {
    if (!settled) {
      settled = true;
      onError('No speech detected — tap to try again');
    }
  };

  recognition.start();
  return recognition;
}
