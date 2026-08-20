const AppError = require('../utils/AppError');

/**
 * Transcribe an audio file URL via Groq Whisper (free tier).
 * Requires GROQ_API_KEY — get one at https://console.groq.com/
 *
 * @param {string} audioUrl Public URL to the audio file.
 * @returns {Promise<{ text: string }>}
 */
async function transcribeAudioUrl(audioUrl) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new AppError(
      'Voice transcription is not configured. Set GROQ_API_KEY on the server (free at console.groq.com).',
      503,
      { code: 'TRANSCRIBE_NOT_CONFIGURED' }
    );
  }

  if (!audioUrl || typeof audioUrl !== 'string') {
    throw new AppError('Audio URL is required', 400, { code: 'VALIDATION_ERROR' });
  }

  let parsed;
  try {
    parsed = new URL(audioUrl);
  } catch {
    throw new AppError('Invalid audio URL', 400, { code: 'VALIDATION_ERROR' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new AppError('Invalid audio URL protocol', 400, { code: 'VALIDATION_ERROR' });
  }

  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) {
    throw new AppError('Could not download audio for transcription', 502, {
      code: 'AUDIO_FETCH_FAILED',
    });
  }

  const contentType = (audioRes.headers.get('content-type') || 'audio/webm').split(';')[0].trim();
  const buffer = Buffer.from(await audioRes.arrayBuffer());
  if (!buffer.length) {
    throw new AppError('Audio file is empty', 400, { code: 'EMPTY_AUDIO' });
  }

  const ext = contentType.includes('mpeg') || contentType.includes('mp3')
    ? 'mp3'
    : contentType.includes('wav')
      ? 'wav'
      : contentType.includes('ogg')
        ? 'ogg'
        : contentType.includes('mp4') || contentType.includes('m4a')
          ? 'm4a'
          : contentType.includes('flac')
            ? 'flac'
            : 'webm';

  const form = new FormData();
  // Free Groq Whisper model
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'json');
  form.append(
    'file',
    new Blob([buffer], { type: contentType || 'audio/webm' }),
    `voice.${ext}`
  );

  const whisperRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  const raw = await whisperRes.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new AppError('Transcription service returned an invalid response', 502, {
      code: 'TRANSCRIBE_FAILED',
    });
  }

  if (!whisperRes.ok) {
    const msg = json?.error?.message || 'Transcription failed';
    throw new AppError(msg, 502, { code: 'TRANSCRIBE_FAILED' });
  }

  const text = typeof json.text === 'string' ? json.text.trim() : '';
  if (!text) {
    throw new AppError('No speech detected in this audio', 422, { code: 'NO_SPEECH' });
  }

  return { text };
}

module.exports = {
  transcribeAudioUrl,
};
