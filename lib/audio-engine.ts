export type VoiceSettings = {
  pitch: number;
  speed: number;
  warmth: number;
  clarity: number;
  formant: number;
  echo: boolean;
  reverb: boolean;
  volume: number;
};

export const DEFAULT_SETTINGS: VoiceSettings = {
  pitch: 0,
  speed: 1,
  warmth: 0,
  clarity: 0,
  formant: 0,
  echo: false,
  reverb: false,
  volume: 0.8,
};

// Two overlapping, windowed delay ramps transpose audio independently of playback speed.
// Native nodes also work offline, keeping playback and export on the same signal path.
export function createAudioGraph(
  ctx: BaseAudioContext,
  settings: VoiceSettings,
) {
  const input = ctx.createGain();
  const pitched = ctx.createGain();
  const modulators: AudioBufferSourceNode[] = [];
  const nodes: AudioNode[] = [input, pitched];
  const now = ctx.currentTime;
  const period = 0.1;
  // Counteract the pitch change inherent in AudioBufferSource.playbackRate.
  const ratio = 2 ** (settings.pitch / 12) / settings.speed;
  const shift = Math.abs(1 - ratio) * period;
  const latency = Math.abs(ratio - 1) < 0.00001 ? 0 : 0.01 + shift / 2;

  if (Math.abs(ratio - 1) < 0.00001) input.connect(pitched);
  else {
    const size = Math.round(ctx.sampleRate * period);
    for (let voice = 0; voice < 2; voice++) {
      const delay = ctx.createDelay(0.5);
      delay.delayTime.value = 0.01;
      const envelope = ctx.createGain();
      envelope.gain.value = 0;
      const ramp = ctx.createBuffer(1, size, ctx.sampleRate);
      const window = ctx.createBuffer(1, size, ctx.sampleRate);
      for (let i = 0; i < size; i++) {
        const phase = (i / size + voice / 2) % 1;
        ramp.getChannelData(0)[i] = (ratio > 1 ? 1 - phase : phase) * shift;
        window.getChannelData(0)[i] = Math.sin(Math.PI * phase) ** 2;
      }
      const modulation = ctx.createBufferSource();
      modulation.buffer = ramp;
      modulation.loop = true;
      modulation.connect(delay.delayTime);
      const fade = ctx.createBufferSource();
      fade.buffer = window;
      fade.loop = true;
      fade.connect(envelope.gain);
      input.connect(delay).connect(envelope).connect(pitched);
      modulation.start(now);
      fade.start(now);
      modulators.push(modulation, fade);
      nodes.push(delay, envelope);
    }
  }

  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 35;
  const bass = ctx.createBiquadFilter();
  bass.type = "lowshelf";
  bass.frequency.value = 250;
  bass.gain.value = settings.warmth;
  const treble = ctx.createBiquadFilter();
  treble.type = "highshelf";
  treble.frequency.value = 3200;
  treble.gain.value = settings.clarity;
  const formant = ctx.createBiquadFilter();
  formant.type = "peaking";
  formant.frequency.value = 1000 * 2 ** (settings.formant / 12);
  formant.Q.value = 0.7;
  formant.gain.value = settings.formant === 0 ? 0 : 5;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = Math.min(20000, ctx.sampleRate * 0.45);
  pitched
    .connect(highpass)
    .connect(bass)
    .connect(treble)
    .connect(formant)
    .connect(lowpass);
  const output = ctx.createGain();
  output.gain.value = settings.volume;
  lowpass.connect(output);
  nodes.push(highpass, bass, treble, formant, lowpass, output);

  if (settings.echo) {
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.26;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.3;
    const wet = ctx.createGain();
    wet.gain.value = 0.25;
    lowpass.connect(delay).connect(feedback).connect(delay);
    delay.connect(wet).connect(output);
    nodes.push(delay, feedback, wet);
  }
  if (settings.reverb) {
    const reverb = ctx.createConvolver();
    const length = Math.round(ctx.sampleRate * 1.8);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    let seed = 42;
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        data[i] = (seed / 2147483648 - 1) * (1 - i / length) ** 3;
      }
    }
    reverb.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    lowpass.connect(reverb).connect(wet).connect(output);
    nodes.push(reverb, wet);
  }
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -4;
  compressor.knee.value = 6;
  compressor.ratio.value = 12;
  output.connect(compressor);
  nodes.push(compressor);
  return {
    input,
    output: compressor,
    latency,
    dispose() {
      modulators.forEach((source) => {
        try {
          source.stop();
        } catch {
          /* already stopped */
        }
        source.disconnect();
      });
      nodes.forEach((node) => node.disconnect());
    },
  };
}

export function effectTail(settings: VoiceSettings) {
  return (
    (settings.reverb || settings.echo ? 2 : 0) +
    (settings.pitch === 0 && settings.speed === 1 ? 0 : 0.32)
  );
}

export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const dataSize = buffer.length * channels * 2;
  const bytes = new ArrayBuffer(44 + dataSize);
  const view = new DataView(bytes);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, dataSize, true);
  const samples = Array.from({ length: channels }, (_, channel) =>
    buffer.getChannelData(channel),
  );
  let offset = 44;
  for (let i = 0; i < buffer.length; i++)
    for (let channel = 0; channel < channels; channel++) {
      const value = Math.max(-1, Math.min(1, samples[channel][i]));
      view.setInt16(
        offset,
        Math.round(value * (value < 0 ? 0x8000 : 0x7fff)),
        true,
      );
      offset += 2;
    }
  return new Blob([bytes], { type: "audio/wav" });
}

export type AudioExportFormat = "wav" | "mp4";

export function getMp4MimeType() {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/mp4;codecs=mp4a.40.2", "audio/mp4"].find((mime) =>
    MediaRecorder.isTypeSupported(mime),
  );
}

async function renderProcessedBuffer(
  buffer: AudioBuffer,
  settings: VoiceSettings,
) {
  const duration = buffer.duration / settings.speed + effectTail(settings);
  const context = new OfflineAudioContext(
    buffer.numberOfChannels,
    Math.ceil(duration * buffer.sampleRate),
    buffer.sampleRate,
  );
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = settings.speed;
  const graph = createAudioGraph(context, settings);
  source.connect(graph.input);
  graph.output.connect(context.destination);
  source.start();
  try {
    return await context.startRendering();
  } finally {
    graph.dispose();
  }
}

export async function renderWav(buffer: AudioBuffer, settings: VoiceSettings) {
  return encodeWav(await renderProcessedBuffer(buffer, settings));
}

// Native MP4 encoding uses MediaRecorder in real time. Feed it the offline render
// so every effect (and its tail) matches WAV export, without playing through speakers.
export async function renderMp4(
  buffer: AudioBuffer,
  settings: VoiceSettings,
  signal: AbortSignal,
) {
  const mimeType = getMp4MimeType();
  if (!mimeType)
    throw new Error(
      "MP4 export is not supported by this browser. Choose WAV or try Safari or a recent version of Chrome.",
    );
  signal.throwIfAborted();
  // Unlock audio during the export button's user gesture, before offline rendering.
  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();
  destination.channelCount = Math.min(2, buffer.numberOfChannels);
  const source = context.createBufferSource();
  let recorder: MediaRecorder | undefined;
  try {
    await context.resume();
    source.buffer = await renderProcessedBuffer(buffer, settings);
    signal.throwIfAborted();
    source.connect(destination);
    recorder = new MediaRecorder(destination.stream, {
      mimeType,
      audioBitsPerSecond: 192000,
    });
    const encoder = recorder;
    return await new Promise<Blob>((resolve, reject) => {
      const chunks: BlobPart[] = [];
      const cleanup = () => {
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
      };
      const abort = () => {
        cleanup();
        reject(new DOMException("Export cancelled", "AbortError"));
      };
      encoder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      encoder.onerror = () => {
        cleanup();
        reject(new Error("MP4 encoding failed. Try exporting as WAV instead."));
      };
      encoder.onstop = () => {
        cleanup();
        const blob = new Blob(chunks, { type: encoder.mimeType || mimeType });
        if (blob.size) resolve(blob);
        else
          reject(
            new Error(
              "The MP4 export was empty. Try exporting as WAV instead.",
            ),
          );
      };
      source.onended = () => {
        if (encoder.state !== "inactive") encoder.stop();
      };
      signal.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(
        () => {
          cleanup();
          reject(
            new Error(
              "MP4 export was interrupted. Keep this tab open and try again.",
            ),
          );
        },
        (source.buffer!.duration + 15) * 1000,
      );
      try {
        encoder.start(250);
        source.start();
      } catch (cause) {
        cleanup();
        reject(cause);
      }
    });
  } finally {
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
    }
    source.onended = null;
    try {
      source.stop();
    } catch {
      /* rendering may have been cancelled before playback */
    }
    source.disconnect();
    destination.disconnect();
    destination.stream.getTracks().forEach((track) => track.stop());
    await context.close();
  }
}
