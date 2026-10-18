"use client";

import { useEffect, useRef } from "react";

export function Waveform({
  buffer,
  stream,
  progress,
  onSeek,
}: {
  buffer: AudioBuffer | null;
  stream: MediaStream | null;
  progress: number;
  onSeek: (value: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const drawing = element.getContext("2d");
    if (!drawing) return;
    let context: AudioContext | undefined;
    let input: MediaStreamAudioSourceNode | undefined;
    let analyser: AnalyserNode | undefined;
    if (stream) {
      context = new AudioContext();
      input = context.createMediaStreamSource(stream);
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      input.connect(analyser);
      void context.resume();
    }
    const samples = new Uint8Array(128);
    const peaks: number[] = [];
    const data = buffer?.getChannelData(0);
    const count = 100;
    for (let i = 0; i < count; i++) {
      let peak = 0;
      if (data) {
        const start = Math.floor((i * data.length) / count);
        const end = Math.floor(((i + 1) * data.length) / count);
        const stride = Math.max(1, Math.floor((end - start) / 350));
        for (let j = start; j < end; j += stride)
          peak = Math.max(peak, Math.abs(data[j]));
      }
      peaks.push(peak);
    }
    let animation = 0;
    const draw = () => {
      cancelAnimationFrame(animation);
      const rect = element.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      element.width = rect.width * scale;
      element.height = rect.height * scale;
      drawing.scale(scale, scale);
      const { width, height } = rect;
      drawing.clearRect(0, 0, width, height);
      drawing.strokeStyle = "#262c2b";
      drawing.lineWidth = 1;
      drawing.beginPath();
      drawing.moveTo(0, height / 2);
      drawing.lineTo(width, height / 2);
      drawing.stroke();
      if (analyser) analyser.getByteFrequencyData(samples);
      for (let i = 0; i < count; i++) {
        const envelope = Math.sin((Math.PI * i) / count) ** 0.6;
        const idle =
          (0.13 + 0.22 * Math.abs(Math.sin(i * 0.79) * Math.cos(i * 0.31))) *
          envelope;
        const value = analyser
          ? samples[Math.floor(i * 0.8)] / 255
          : data
            ? peaks[i]
            : idle;
        const barHeight = Math.max(3, value * height * 0.79);
        drawing.fillStyle = stream
          ? "#baf4d0"
          : data
            ? i / count <= progress
              ? "#baf4d0"
              : "#52655b"
            : "#35443d";
        drawing.beginPath();
        drawing.roundRect(
          (i * width) / count,
          (height - barHeight) / 2,
          Math.max(2, width / count - 3),
          barHeight,
          2,
        );
        drawing.fill();
      }
      if (data && progress > 0) {
        drawing.fillStyle = "#d6fbe4";
        drawing.fillRect(progress * width, 10, 1, height - 20);
      }
      if (analyser) animation = requestAnimationFrame(draw);
    };
    draw();
    const resize = new ResizeObserver(draw);
    resize.observe(element);
    return () => {
      cancelAnimationFrame(animation);
      resize.disconnect();
      input?.disconnect();
      void context?.close();
    };
  }, [buffer, stream, progress]);

  return (
    <div className={`waveform ${buffer ? "can-seek" : ""}`}>
      <canvas ref={canvas} aria-hidden="true" />
      {buffer && (
        <input
          className="waveform-seek"
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          aria-label="Seek audio"
          onChange={(event) => onSeek(Number(event.target.value))}
        />
      )}
    </div>
  );
}
