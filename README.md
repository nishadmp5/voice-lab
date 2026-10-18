# Voice Lab

A private, browser-based voice studio built with Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, and the Web Audio API. Audio is processed entirely on the device; no server upload, account, or API key is required.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:3000. Recording requires HTTPS or localhost and microphone permission.

## Production and offline mode

```sh
npm run build
npm start
```

The `@ducanh2912/next-pwa` plugin generates `public/sw.js` and precaches the app shell and assets. A client component explicitly registers the worker for compatibility with Next.js 16 App Router. Webpack is intentional: the requested PWA plugin uses a Webpack build hook. Development disables the service worker to avoid stale assets.

Visit the production app once while online before using it offline. Install through Chrome's browser menu or Safari's Share → Add to Home Screen. Real devices need an HTTPS deployment. The manifest includes regular, maskable, and Apple touch icons. To regenerate icons, run `node scripts/generate-icons.mjs`.

## Use

1. Tap to start and stop recording, or hold the microphone and release to stop. The recorder selects WebM/Opus when supported, with MP4/AAC and Ogg fallbacks and a browser-default fallback.
2. Import or drop MP3, WAV, M4A, or WebM audio. Decoding depends on browser codec support. Files are limited to 100 MB and 10 minutes to bound memory use.
3. Play and seek through the waveform. Try a preset or change pitch (±12 semitones), speed (0.5–2×), bass/warmth, treble/clarity, and formant color. Add echo and/or reverb.
4. Choose WAV (lossless) or MP4 audio in the export format selector. WAV uses 16-bit PCM at the decoded sample rate and channel count. MP4 uses the browser’s native AAC/MP4 encoder at a requested 192 kbps and is enabled only when supported. Both formats include all effects, effect tails, and the selected output volume. MP4 encoding runs silently in real time: keep the tab open for the clip’s duration, or use Cancel export to stop. No audio is sent to a server.

`R` toggles recording; `Space` toggles playback when a clip is loaded. Native sliders support keyboard arrows. Audio sessions remain in memory: export before closing or refreshing the app.

## Audio implementation

- `hooks/use-audio-recorder.ts`: MIME negotiation, permissions, recording timer, cancellation, and microphone cleanup.
- `hooks/use-audio-engine.ts`: lazy browser-only AudioContext, decoding, transport, live parameter updates, and downloads.
- `lib/audio-engine.ts`: shared native-node processing graph, OfflineAudioContext rendering, RIFF/WAV encoding, and native MP4 encoding.
- `components/waveform.tsx`: microphone analyser and decoded audio waveform with accessible seek input.

Pitch uses two overlapping windowed delay ramps. The graph compensates for playback-rate transposition so speed and pitch are independent. This lightweight granular effect can color the sound at extreme settings. Formant color is a peaking-EQ resonance simulation, not a full speech formant-preservation algorithm. Slider changes rebuild the graph with a short debounce while retaining the transport position. The live waveform displays the microphone input or original decoded clip; playback progress follows the source timeline.

## Verify

```sh
npm run lint
npx tsc --noEmit
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright starts an isolated production server on port 3107. Tests cover tap/hold recording with a simulated microphone, import/error handling, playback/seeking, preset controls, WAV headers, measured pitch and speed independence, effects tails, a mobile viewport, dialogs, offline reload/import, MP4 container/codec validation, decoded MP4 pitch/duration, export cancellation, and browsers without MP4 encoding. Physical iOS Safari and Android Chrome microphone/installation behavior still needs device testing.

The requested PWA package currently inherits npm audit advisories through build dependencies (Workbox/serialization/glob tooling). Avoid an automatic forced downgrade of Next.js or the PWA plugin; review compatible upstream fixes before production release.
