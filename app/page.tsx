"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import Link from "next/link";
import {
  AudioLines,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  CloudOff,
  Download,
  Headphones,
  Leaf,
  LoaderCircle,
  Mic,
  MoreHorizontal,
  Pause,
  Play,
  Radio,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Upload,
  Volume2,
  Waves,
  Wind,
  X,
} from "lucide-react";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useAudioEngine } from "@/hooks/use-audio-engine";
import {
  DEFAULT_SETTINGS,
  getMp4MimeType,
  type AudioExportFormat,
  type VoiceSettings,
} from "@/lib/audio-engine";
import { Waveform } from "@/components/waveform";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const PRESETS = [
  {
    name: "Natural",
    description: "You, just as you are.",
    icon: Leaf,
    className: "natural",
    settings: {},
  },
  {
    name: "Deep voice",
    description: "A little more gravity.",
    icon: AudioLines,
    className: "deep",
    settings: { pitch: -5, warmth: 4, clarity: -1 },
  },
  {
    name: "Helium",
    description: "Lighten things up.",
    icon: Wind,
    className: "helium",
    settings: { pitch: 7, warmth: -2, clarity: 3 },
  },
  {
    name: "On air",
    description: "Made for the mic.",
    icon: Radio,
    className: "radio",
    settings: { pitch: -1, warmth: 3, clarity: 4, reverb: true },
  },
];
const time = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);
const subscribeCapabilities = () => () => {};
const subscribeOnline = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};
const subscribeInstalled = (notify: () => void) => {
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", notify);
  window.addEventListener("appinstalled", notify);
  return () => {
    query.removeEventListener("change", notify);
    window.removeEventListener("appinstalled", notify);
  };
};

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  left,
  right,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  left: string;
  right: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="control-slider">
      <span className="slider-heading">
        <span>{label}</span>
        <span className="slider-value">
          {unit === "×" ? value.toFixed(2) : signed(value)}
          <small>{unit}</small>
        </span>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={
          {
            "--fill": `${((value - min) / (max - min)) * 100}%`,
          } as CSSProperties
        }
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="slider-labels">
        <span>{left}</span>
        <span>{right}</span>
      </span>
    </label>
  );
}

export default function Home() {
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_SETTINGS);
  const [exportFormat, setExportFormat] = useState<AudioExportFormat>("wav");
  const mp4Supported = useSyncExternalStore(
    subscribeCapabilities,
    () => !!getMp4MimeType(),
    () => false,
  );
  const [preset, setPreset] = useState("Natural");
  const [name, setName] = useState("Untitled session");
  const [dragging, setDragging] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const installed = useSyncExternalStore(
    subscribeInstalled,
    () => window.matchMedia("(display-mode: standalone)").matches,
    () => false,
  );
  const offline = useSyncExternalStore(
    subscribeOnline,
    () => !navigator.onLine,
    () => false,
  );
  const [moreTone, setMoreTone] = useState(false);
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const installDialog = useRef<HTMLDialogElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStarted = useRef(false);
  const engine = useAudioEngine(settings);
  const { load, pause, play, isPlaying } = engine;
  const onRecorded = useCallback(
    async (blob: Blob) => {
      if (await load(blob)) {
        setName(
          `Recording ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        );
        setNotice("Recording ready. Make it your own.");
      }
    },
    [load],
  );
  const recorder = useAudioRecorder(onRecorded);
  const {
    status: recorderStatus,
    stop: stopRecording,
    start: startRecording,
  } = recorder;
  const recording = recorder.status === "recording";
  const busy =
    engine.loading || engine.exporting || recorder.status === "requesting";
  const hasAudio = !!engine.buffer;
  const progress = engine.buffer ? engine.position / engine.buffer.duration : 0;
  const error = engine.error || recorder.error;

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    const done = () => setInstallEvent(null);
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  useEffect(() => {
    if (showHelp) helpDialog.current?.showModal();
    else helpDialog.current?.close();
  }, [showHelp]);
  useEffect(() => {
    if (showInstall) installDialog.current?.showModal();
    else installDialog.current?.close();
  }, [showInstall]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    [],
  );

  const toggleRecord = useCallback(() => {
    if (recorderStatus !== "idle") stopRecording();
    else {
      pause();
      void startRecording();
    }
  }, [recorderStatus, stopRecording, startRecording, pause]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        ["INPUT", "TEXTAREA", "BUTTON"].includes(target.tagName) ||
        showHelp ||
        showInstall ||
        busy
      )
        return;
      if (event.code === "Space" && hasAudio && !recording) {
        event.preventDefault();
        if (isPlaying) pause();
        else void play();
      }
      if (event.code === "KeyR" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        toggleRecord();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [
    isPlaying,
    pause,
    play,
    hasAudio,
    recording,
    busy,
    showHelp,
    showInstall,
    toggleRecord,
  ]);

  const change = <K extends keyof VoiceSettings>(
    key: K,
    value: VoiceSettings[K],
  ) => {
    setSettings((previous) => ({ ...previous, [key]: value }));
    setPreset("");
  };
  const importFile = async (file?: File) => {
    if (!file || recording || busy) return;
    if (await engine.load(file)) {
      setName(file.name);
      setNotice("Audio imported. Time to experiment.");
    }
  };
  const selectPreset = (index: number) => {
    const item = PRESETS[index];
    setPreset(item.name);
    setSettings({
      ...DEFAULT_SETTINGS,
      ...item.settings,
      volume: settings.volume,
    });
  };
  const newSession = () => {
    engine.clear();
    setName("Untitled session");
    setSettings(DEFAULT_SETTINGS);
    setPreset("Natural");
    setNotice("A fresh start. Ready when you are.");
  };
  const install = async () => {
    if (!installEvent) {
      setShowInstall(true);
      return;
    }
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Voice Lab home">
          <span className="brand-mark">
            <AudioLines size={25} strokeWidth={2.4} />
          </span>
          <span>
            voice<span className="brand-light">lab</span>
            <span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="sidebar-label">WORKSPACE</div>
        <nav>
          <a className="nav-item active" href="#studio">
            <SlidersHorizontal size={18} />
            <span>Voice studio</span>
            <span className="nav-dot" />
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <span className="local-icon">
              <ShieldCheck size={20} />
            </span>
            <h3>Your voice. Your space.</h3>
            <p>Your audio stays on your device. Always.</p>
            <span className="local-card-line">
              <span className="status-dot" />
              100% private
            </span>
          </div>
          <button className="nav-item" onClick={() => setShowHelp(true)}>
            <CircleHelp size={18} />
            <span>A little help</span>
            <span className="shortcut">?</span>
          </button>
          <button
            className="nav-item"
            onClick={() => void install()}
            disabled={installed}
          >
            <ArrowDownToLine size={18} />
            <span>{installed ? "App installed" : "Install app"}</span>
          </button>
          <div className="sidebar-version">
            <span>VOICE LAB</span>
            <span>v1.0</span>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="breadcrumb-divider">/</span>
            <strong>Voice studio</strong>
          </div>
          <div className="local-badge">
            {offline ? <CloudOff size={13} /> : <span className="status-dot" />}
            {offline ? "Offline mode" : "All processing stays local"}
          </div>
          <button
            className="help-top icon-button"
            aria-label="Help"
            onClick={() => setShowHelp(true)}
          >
            <CircleHelp size={18} />
          </button>
        </header>
        <main id="studio">
          <section className="intro">
            <div>
              <div className="eyebrow">
                <span /> YOUR PERSONAL VOICE PLAYGROUND
              </div>
              <h1>
                Find your <span>other voice.</span>
              </h1>
              <p>Record a little. Tweak a little. Sound a little different.</p>
            </div>
            <div className="intro-note">
              <Headphones size={16} />
              <span>Best enjoyed with headphones</span>
            </div>
          </section>

          <div className="studio-grid">
            <div className="recording-column">
              <section
                className={`recorder-panel panel ${dragging ? "dragging" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  void importFile(event.dataTransfer.files[0]);
                }}
                aria-label="Recording studio"
              >
                <div className="panel-heading">
                  <div className="session-title">
                    <span
                      className={`session-led ${recording ? "recording" : ""}`}
                    />
                    <span title={name}>{name}</span>
                    <span className="file-tag">
                      {recording ? "LIVE" : hasAudio ? "AUDIO" : "NEW"}
                    </span>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Start new session"
                    title="Start new session"
                    onClick={newSession}
                    disabled={busy || recording || !hasAudio}
                  >
                    <MoreHorizontal size={19} />
                  </button>
                </div>
                <div className="recording-stage">
                  <div className="recording-state">
                    {recording
                      ? "LISTENING TO YOU"
                      : engine.loading
                        ? "GETTING YOUR AUDIO READY"
                        : hasAudio
                          ? engine.isPlaying
                            ? "LET IT PLAY"
                            : "YOUR VOICE, READY TO EXPLORE"
                          : "GOOD THINGS START WITH YOUR VOICE"}
                  </div>
                  <div className="recording-time">
                    {time(
                      recording
                        ? recorder.elapsed
                        : engine.position / settings.speed,
                    )}
                    <span>
                      .
                      {Math.floor(
                        ((recording
                          ? recorder.elapsed
                          : engine.position / settings.speed) %
                          1) *
                          100,
                      )
                        .toString()
                        .padStart(2, "0")}
                    </span>
                  </div>
                  <Waveform
                    buffer={recording ? null : engine.buffer}
                    stream={recorder.stream}
                    progress={progress}
                    onSeek={engine.seek}
                  />
                  <div className="waveform-ruler">
                    <span>00:00</span>
                    <span>
                      {recording
                        ? "Recording…"
                        : hasAudio
                          ? `${engine.buffer!.sampleRate / 1000} kHz · ${engine.buffer!.numberOfChannels === 1 ? "Mono" : "Stereo"}`
                          : "A blank canvas for your sound"}
                    </span>
                    <span>
                      {hasAudio
                        ? time(engine.buffer!.duration / settings.speed)
                        : "00:00"}
                    </span>
                  </div>
                </div>
                <div className="record-action">
                  <button
                    className={`record-button ${recording ? "is-recording" : ""}`}
                    aria-label={
                      recording ? "Stop recording" : "Start recording"
                    }
                    disabled={engine.loading || engine.exporting}
                    onPointerDown={(event) => {
                      if (event.button !== 0 || recording) return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      holdStarted.current = false;
                      holdTimer.current = setTimeout(() => {
                        holdStarted.current = true;
                        engine.pause();
                        void recorder.start();
                      }, 220);
                    }}
                    onPointerUp={() => {
                      if (holdTimer.current) clearTimeout(holdTimer.current);
                      if (holdStarted.current) recorder.stop();
                    }}
                    onPointerCancel={() => {
                      if (holdTimer.current) clearTimeout(holdTimer.current);
                      if (holdStarted.current) recorder.stop();
                    }}
                    onClick={() => {
                      if (holdStarted.current) {
                        holdStarted.current = false;
                        return;
                      }
                      toggleRecord();
                    }}
                  >
                    {busy && !engine.exporting ? (
                      <LoaderCircle className="spin" size={24} />
                    ) : recording ? (
                      <Square size={23} fill="currentColor" />
                    ) : (
                      <Mic size={25} strokeWidth={1.8} />
                    )}
                  </button>
                  <h2>
                    {recording
                      ? "Your moment. Keep talking."
                      : hasAudio
                        ? "Another take? Make it yours."
                        : "Ready when you are."}
                  </h2>
                  <p>
                    {recording
                      ? "Tap again or release to finish recording"
                      : "Tap to record, or press and hold"}
                  </p>
                </div>
                <div className="import-area">
                  <span className="import-or">or bring your own audio</span>
                  <button
                    className="import-button"
                    disabled={busy || recording}
                    onClick={() => fileInput.current?.click()}
                  >
                    <Upload size={15} />
                    Import audio
                    <span className="file-types">MP3, WAV, M4A, WEBM</span>
                  </button>
                  <span className="drop-hint">
                    You can drag & drop a file here, too
                  </span>
                </div>
                <input
                  ref={fileInput}
                  className="sr-only"
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.webm,.mp4,.aac"
                  aria-label="Import audio file"
                  onChange={(event) => {
                    void importFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <div className="transport">
                  <div className="transport-buttons">
                    <button
                      className="icon-button"
                      aria-label="Restart audio"
                      disabled={!hasAudio || recording || busy}
                      onClick={() => engine.seek(0)}
                    >
                      <RotateCcw size={17} />
                    </button>
                    <button
                      className="play-button"
                      aria-label={
                        engine.isPlaying ? "Pause audio" : "Play audio"
                      }
                      disabled={!hasAudio || recording || busy}
                      onClick={() =>
                        engine.isPlaying ? engine.pause() : void engine.play()
                      }
                    >
                      {engine.isPlaying ? (
                        <Pause size={17} fill="currentColor" />
                      ) : (
                        <Play size={17} fill="currentColor" />
                      )}
                    </button>
                    <span className="transport-time">
                      {time(engine.position / settings.speed)}
                      <span>
                        {" "}
                        /{" "}
                        {time((engine.buffer?.duration ?? 0) / settings.speed)}
                      </span>
                    </span>
                  </div>
                  <div className="volume-control">
                    <Volume2 size={16} />
                    <input
                      type="range"
                      aria-label="Output volume"
                      min={0}
                      max={1}
                      step={0.01}
                      value={settings.volume}
                      onChange={(event) =>
                        change("volume", Number(event.target.value))
                      }
                    />
                  </div>
                </div>
              </section>
              <div className="presets-heading">
                <h2>
                  <Sparkles size={15} />A shortcut to a new sound
                </h2>
                <span>TRY A PRESET</span>
              </div>
              <div className="preset-grid">
                {PRESETS.map((item, index) => (
                  <button
                    key={item.name}
                    className={`preset-card ${preset === item.name ? "selected" : ""}`}
                    onClick={() => selectPreset(index)}
                    aria-pressed={preset === item.name}
                  >
                    <span className={`preset-icon ${item.className}`}>
                      <item.icon size={19} strokeWidth={1.6} />
                    </span>
                    {preset === item.name && (
                      <Check className="preset-check" size={13} />
                    )}
                    <strong>{item.name}</strong>
                    <span>{item.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <section
              className="properties-panel panel"
              aria-label="Voice properties"
            >
              <div className="panel-heading">
                <h2>
                  <SlidersHorizontal size={17} />
                  Voice properties
                </h2>
                <button
                  className="reset-button"
                  onClick={() => {
                    setSettings(DEFAULT_SETTINGS);
                    setPreset("Natural");
                  }}
                >
                  <RotateCcw size={12} />
                  Reset
                </button>
              </div>
              <div className="properties-content">
                <div className="properties-description">
                  Small adjustments. A whole new sound.
                </div>
                <Slider
                  label="Pitch"
                  value={settings.pitch}
                  min={-12}
                  max={12}
                  unit="st"
                  left="Deeper"
                  right="Higher"
                  onChange={(value) => change("pitch", value)}
                />
                <Slider
                  label="Speed"
                  value={settings.speed}
                  min={0.5}
                  max={2}
                  step={0.05}
                  unit="×"
                  left="0.5× · Slower"
                  right="2× · Faster"
                  onChange={(value) => change("speed", value)}
                />
                <div className="control-divider" />
                <div className="section-label">SHAPE YOUR TONE</div>
                <Slider
                  label="Warmth"
                  value={settings.warmth}
                  min={-12}
                  max={12}
                  unit="dB"
                  left="Lighter"
                  right="Fuller"
                  onChange={(value) => change("warmth", value)}
                />
                <Slider
                  label="Clarity"
                  value={settings.clarity}
                  min={-12}
                  max={12}
                  unit="dB"
                  left="Softer"
                  right="Brighter"
                  onChange={(value) => change("clarity", value)}
                />
                <button
                  className={`advanced-button ${moreTone ? "open" : ""}`}
                  aria-expanded={moreTone}
                  onClick={() => setMoreTone(!moreTone)}
                >
                  More tone controls
                  <ChevronDown size={13} />
                </button>
                {moreTone && (
                  <Slider
                    label="Formant color"
                    value={settings.formant}
                    min={-12}
                    max={12}
                    unit="st"
                    left="Dark resonance"
                    right="Bright resonance"
                    onChange={(value) => change("formant", value)}
                  />
                )}
                <div className="control-divider effects-divider" />
                <div className="section-label">A LITTLE ATMOSPHERE</div>
                <div className="effect-row">
                  <span className="effect-icon">
                    <Waves size={18} />
                  </span>
                  <span>
                    <strong>Echo</strong>
                    <small>Give your voice some space</small>
                  </span>
                  <button
                    role="switch"
                    aria-checked={settings.echo}
                    aria-label="Echo"
                    className={`toggle ${settings.echo ? "on" : ""}`}
                    onClick={() => change("echo", !settings.echo)}
                  >
                    <span />
                  </button>
                </div>
                <div className="effect-row">
                  <span className="effect-icon">
                    <Wind size={18} />
                  </span>
                  <span>
                    <strong>Reverb</strong>
                    <small>A touch of room, a little depth</small>
                  </span>
                  <button
                    role="switch"
                    aria-checked={settings.reverb}
                    aria-label="Reverb"
                    className={`toggle ${settings.reverb ? "on" : ""}`}
                    onClick={() => change("reverb", !settings.reverb)}
                  >
                    <span />
                  </button>
                </div>
                <div className="export-area">
                  <label className="export-format">
                    <span>Export format</span>
                    <select
                      aria-label="Export format"
                      value={exportFormat}
                      disabled={engine.exporting}
                      onChange={(event) =>
                        setExportFormat(event.target.value as AudioExportFormat)
                      }
                    >
                      <option value="wav">WAV · Lossless</option>
                      <option value="mp4" disabled={!mp4Supported}>
                        MP4 · Audio{!mp4Supported ? " (unavailable)" : ""}
                      </option>
                    </select>
                  </label>
                  <button
                    className="export-button"
                    disabled={!hasAudio || recording || busy}
                    onClick={() => void engine.exportAudio(name, exportFormat)}
                  >
                    {engine.exporting ? (
                      <LoaderCircle size={16} className="spin" />
                    ) : (
                      <Download size={16} />
                    )}
                    {engine.exporting
                      ? exportFormat === "mp4"
                        ? "Encoding MP4 audio…"
                        : "Rendering your audio…"
                      : "Export tuned audio"}
                    {!engine.exporting && <ArrowRight size={16} />}
                  </button>
                  {engine.exporting && (
                    <button
                      className="cancel-export"
                      onClick={engine.cancelExport}
                    >
                      Cancel export
                    </button>
                  )}
                  <span>
                    {exportFormat === "mp4"
                      ? "MP4 audio · All effects included"
                      : "WAV format · Full quality · All yours"}
                  </span>
                  {exportFormat === "mp4" && (
                    <p className="export-note">
                      Export takes the clip’s length. Keep this tab open.
                    </p>
                  )}
                  {!mp4Supported && (
                    <p className="export-note">
                      MP4 export isn’t supported in this browser.
                    </p>
                  )}
                </div>
              </div>
            </section>
          </div>
          <footer className="studio-footer">
            <span>
              <ShieldCheck size={14} />
              Made for your ears only. Nothing leaves this device.
            </span>
            <span className="keyboard-hints">
              <kbd>R</kbd> record <span className="footer-dot">·</span>
              <kbd>space</kbd> play / pause
            </span>
          </footer>
          {(error || notice) && (
            <div
              role={error ? "alert" : "status"}
              className={`toast ${error ? "error" : ""}`}
            >
              {error ? <CircleHelp size={17} /> : <Check size={17} />}
              <span>{error || notice}</span>
            </div>
          )}
        </main>
      </div>
      <dialog
        ref={helpDialog}
        className="info-dialog"
        onCancel={() => setShowHelp(false)}
      >
        <button
          className="dialog-close icon-button"
          aria-label="Close help"
          onClick={() => setShowHelp(false)}
        >
          <X size={20} />
        </button>
        <span className="dialog-icon">
          <Mic size={27} />
        </span>
        <h2>A little help. A lot of possibility.</h2>
        <p>
          Tap the microphone to start and stop, or hold it while you speak.
          Import a file to work with something you already have.
        </p>
        <ol>
          <li>
            <strong>Make a little noise.</strong> Record or import up to 10
            minutes of audio.
          </li>
          <li>
            <strong>Find your sound.</strong> Try a preset, or move the sliders
            while playing. Pitch and speed work independently. Formant color
            simulates resonance with an EQ filter.
          </li>
          <li>
            <strong>Take it with you.</strong> Export your changes as a WAV or
            MP4 audio file. MP4 is available in supported browsers and exports
            in real time.
          </li>
        </ol>
        <p className="dialog-note">
          <Headphones size={17} />
          Headphones help you hear every little change.
        </p>
        <button className="export-button" onClick={() => setShowHelp(false)}>
          Let’s make something
          <ArrowRight size={16} />
        </button>
      </dialog>
      <dialog
        ref={installDialog}
        className="info-dialog"
        onCancel={() => setShowInstall(false)}
      >
        <button
          className="dialog-close icon-button"
          aria-label="Close install instructions"
          onClick={() => setShowInstall(false)}
        >
          <X size={20} />
        </button>
        <span className="dialog-icon">
          <Download size={27} />
        </span>
        <h2>A tiny studio. Always with you.</h2>
        <p>
          Install Voice Lab to open it from your home screen and use it offline
          after your first visit.
        </p>
        <p>
          <strong>iPhone or iPad</strong>
          <br />
          In Safari, tap Share, then “Add to Home Screen”.
        </p>
        <p>
          <strong>Android or desktop</strong>
          <br />
          In Chrome, open the browser menu and choose “Install app” or “Add to
          Home screen”.
        </p>
        <p className="dialog-note">
          Installation is available on HTTPS or localhost in a production build.
          Audio sessions stay in memory; export a clip before closing the app.
        </p>
        <button className="export-button" onClick={() => setShowInstall(false)}>
          <ArrowLeft size={16} />
          Back to the studio
        </button>
      </dialog>
    </div>
  );
}
