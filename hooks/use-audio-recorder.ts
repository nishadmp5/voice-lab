"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function getRecordingMimeType() {
  return [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
    "audio/ogg;codecs=opus",
  ].find((type) => MediaRecorder.isTypeSupported(type));
}

export function useAudioRecorder(onRecorded: (blob: Blob) => void) {
  const [status, setStatus] = useState<"idle" | "requesting" | "recording">(
    "idle",
  );
  const [elapsed, setElapsed] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const tracks = useRef<MediaStream | null>(null);
  const active = useRef(false);
  const callback = useRef(onRecorded);
  useEffect(() => {
    callback.current = onRecorded;
  }, [onRecorded]);

  const stop = useCallback(() => {
    active.current = false;
    if (recorder.current?.state === "recording") recorder.current.stop();
    tracks.current?.getTracks().forEach((track) => track.stop());
    tracks.current = null;
    setStream(null);
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    if (active.current) return;
    setError(null);
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(
        "Recording needs a supported browser and HTTPS (or localhost). You can still import an audio file.",
      );
      return;
    }
    active.current = true;
    setStatus("requesting");
    let media: MediaStream | undefined;
    try {
      media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (!active.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      tracks.current = media;
      const mimeType = getRecordingMimeType();
      const instance = new MediaRecorder(
        media,
        mimeType ? { mimeType } : undefined,
      );
      const chunks: BlobPart[] = [];
      instance.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      instance.onstop = () => {
        const blob = new Blob(chunks, {
          type: instance.mimeType || mimeType || "audio/mp4",
        });
        if (blob.size) callback.current(blob);
      };
      instance.onerror = () => {
        setError("Recording was interrupted. Please try again.");
        stop();
      };
      recorder.current = instance;
      instance.start(250);
      setElapsed(0);
      setStream(media);
      setStatus("recording");
    } catch (cause) {
      media?.getTracks().forEach((track) => track.stop());
      active.current = false;
      setStatus("idle");
      setError(
        cause instanceof DOMException && cause.name === "NotAllowedError"
          ? "Microphone access was denied. Allow it in your browser settings, or import a file."
          : "Could not open your microphone. Check that it is connected and try again.",
      );
    }
  }, [stop]);

  useEffect(() => {
    if (status !== "recording") return;
    const began = Date.now();
    const timer = setInterval(
      () => setElapsed((Date.now() - began) / 1000),
      100,
    );
    return () => clearInterval(timer);
  }, [status]);

  useEffect(
    () => () => {
      active.current = false;
      if (recorder.current) {
        recorder.current.onstop = null;
        if (recorder.current.state !== "inactive") recorder.current.stop();
      }
      tracks.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  return { status, elapsed, stream, error, start, stop };
}
