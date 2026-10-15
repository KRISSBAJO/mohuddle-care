/*
 * Browser audio helpers shared by the note scribe and Ask Mohuddle. Recordings are decoded here to
 * 16 kHz mono 16-bit PCM, the only thing sent to the server; the recording itself is never uploaded or saved.
 */

export async function toPcm(blob: Blob): Promise<ArrayBuffer> {
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(audio.duration * 16000)), 16000);
    const source = offline.createBufferSource();
    source.buffer = audio;
    source.connect(offline.destination);
    source.start();
    const samples = (await offline.startRendering()).getChannelData(0);
    const pcm = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) pcm[i] = Math.max(-1, Math.min(1, samples[i])) * 0x7fff;
    return pcm.buffer;
  } finally {
    void context.close();
  }
}

/* Sends a recording for transcription and returns the words, or throws with a plain message. */
export async function transcribeBlob(blob: Blob, query: string): Promise<string> {
  const pcm = await toPcm(blob);
  const response = await fetch(`/api/scribe/transcribe?${query}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: pcm });
  const body = (await response.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!response.ok || body.error) throw new Error(body.error ?? "Could not turn the recording into words.");
  return body.text ?? "";
}
