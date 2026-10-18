"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createAudioGraph,
  effectTail,
  renderWav,
  renderMp4,
  type AudioExportFormat,
  type VoiceSettings,
} from "@/lib/audio-engine";

type Playback = {
  source: AudioBufferSourceNode;
  graph: ReturnType<typeof createAudioGraph>;
  offset: number;
  started: number;
  speed: number;
  tailTimer?: ReturnType<typeof setTimeout>;
};

export function useAudioEngine(settings: VoiceSettings) {
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const context = useRef<AudioContext | null>(null);
  const playback = useRef<Playback | null>(null);
  const cursor = useRef(0);
  const currentBuffer = useRef<AudioBuffer | null>(null);
  const currentSettings = useRef(settings);
  const generation = useRef(0);
  const exportController = useRef<AbortController | null>(null);
  useEffect(() => {
    currentSettings.current = settings;
  }, [settings]);

  const getContext = useCallback(() => {
    if (!context.current || context.current.state === "closed")
      context.current = new AudioContext();
    return context.current;
  }, []);

  const halt = useCallback(() => {
    const active = playback.current;
    if (active) {
      cursor.current = Math.min(
        currentBuffer.current?.duration ?? 0,
        active.offset +
          Math.max(0, (context.current?.currentTime ?? 0) - active.started) *
            active.speed,
      );
      active.source.onended = null;
      active.source.stop();
      active.source.disconnect();
      active.graph.dispose();
      clearTimeout(active.tailTimer);
      playback.current = null;
    }
  }, []);

  const pause = useCallback(() => {
    halt();
    setPlaying(false);
    setPosition(cursor.current);
  }, [halt]);

  const begin = useCallback(
    (offset: number) => {
      const audio = currentBuffer.current;
      if (!audio) return;
      const ctx = getContext();
      halt();
      const options = currentSettings.current;
      const source = ctx.createBufferSource();
      source.buffer = audio;
      source.playbackRate.value = options.speed;
      const graph = createAudioGraph(ctx, options);
      source.connect(graph.input);
      graph.output.connect(ctx.destination);
      const start = Math.max(0, Math.min(offset, audio.duration - 0.001));
      const active: Playback = {
        source,
        graph,
        offset: start,
        started: ctx.currentTime,
        speed: options.speed,
      };
      playback.current = active;
      cursor.current = start;
      source.onended = () => {
        active.tailTimer = setTimeout(
          () => {
            if (playback.current !== active) return;
            graph.dispose();
            source.disconnect();
            playback.current = null;
            cursor.current = 0;
            setPosition(0);
            setPlaying(false);
          },
          effectTail(options) * 1000,
        );
      };
      source.start(0, start);
      setPlaying(true);
    },
    [getContext, halt],
  );

  const play = useCallback(async () => {
    try {
      setError(null);
      await getContext().resume();
      begin(
        cursor.current >= (currentBuffer.current?.duration ?? 0)
          ? 0
          : cursor.current,
      );
    } catch {
      setError("Audio playback could not start. Tap Play to try again.");
      setPlaying(false);
    }
  }, [begin, getContext]);

  const seek = useCallback(
    (fraction: number) => {
      const next =
        Math.max(0, Math.min(0.9999, fraction)) *
        (currentBuffer.current?.duration ?? 0);
      if (playback.current) begin(next);
      else cursor.current = next;
      setPosition(next);
    },
    [begin],
  );

  const load = useCallback(
    async (blob: Blob) => {
      const request = ++generation.current;
      pause();
      setLoading(true);
      setError(null);
      try {
        if (blob.size > 100 * 1024 * 1024)
          throw new Error("Choose an audio file smaller than 100 MB.");
        const ctx = getContext();
        // Resume synchronously from the user's import/record action for iOS.
        void ctx.resume().catch(() => {});
        const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
        if (request !== generation.current) return false;
        if (decoded.duration > 600)
          throw new Error(
            "Choose a clip under 10 minutes for reliable in-browser editing.",
          );
        currentBuffer.current = decoded;
        setBuffer(decoded);
        cursor.current = 0;
        setPosition(0);
        return true;
      } catch (cause) {
        if (request === generation.current)
          setError(
            cause instanceof Error &&
              !["EncodingError", "NotSupportedError"].includes(cause.name)
              ? cause.message
              : "This audio could not be decoded. Try an MP3, WAV, M4A, or WebM file supported by your browser.",
          );
        return false;
      } finally {
        if (request === generation.current) setLoading(false);
      }
    },
    [getContext, pause],
  );

  const clear = useCallback(() => {
    generation.current++;
    pause();
    currentBuffer.current = null;
    setBuffer(null);
    cursor.current = 0;
    setPosition(0);
    setError(null);
    setLoading(false);
  }, [pause]);

  const cancelExport = useCallback(() => exportController.current?.abort(), []);

  const exportAudio = useCallback(
    async (name: string, format: AudioExportFormat = "wav") => {
      if (!currentBuffer.current || exportController.current) return;
      const controller = new AbortController();
      exportController.current = controller;
      pause();
      setExporting(true);
      setError(null);
      try {
        const output =
          format === "mp4"
            ? await renderMp4(
                currentBuffer.current,
                currentSettings.current,
                controller.signal,
              )
            : await renderWav(currentBuffer.current, currentSettings.current);
        controller.signal.throwIfAborted();
        const url = URL.createObjectURL(output);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${
          name
            .replace(/\.[^.]+$/, "")
            .replace(/[^a-zA-Z0-9 _-]/g, "")
            .trim() || "voice"
        }-tuned.${format}`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not export this clip. Try again.",
          );
      } finally {
        exportController.current = null;
        setExporting(false);
      }
    },
    [pause],
  );

  useEffect(() => {
    if (!isPlaying) return;
    let frame: number;
    const update = () => {
      const active = playback.current;
      if (active && context.current) {
        cursor.current = Math.min(
          currentBuffer.current?.duration ?? 0,
          active.offset +
            (context.current.currentTime - active.started) * active.speed,
        );
        setPosition(cursor.current);
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying]);

  useEffect(() => {
    if (!playback.current) return;
    const timer = setTimeout(() => {
      if (playback.current) {
        halt();
        begin(cursor.current);
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [settings, begin, halt]);

  useEffect(
    () => () => {
      generation.current++;
      exportController.current?.abort();
      halt();
      void context.current?.close();
    },
    [halt],
  );

  return {
    buffer,
    isPlaying,
    position,
    loading,
    exporting,
    error,
    load,
    play,
    pause,
    seek,
    clear,
    exportAudio,
    cancelExport,
  };
}
