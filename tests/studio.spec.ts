import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { getRecordingMimeType } from "../hooks/use-audio-recorder";

function sineWav(seconds = 3, frequency = 440) {
  const rate = 44100;
  const length = rate * seconds;
  const wav = Buffer.alloc(44 + length * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + length * 2, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(length * 2, 40);
  for (let i = 0; i < length; i++)
    wav.writeInt16LE(
      Math.round(Math.sin((i / rate) * frequency * 2 * Math.PI) * 12000),
      44 + i * 2,
    );
  return wav;
}

async function importTone(page: Page) {
  await page.getByLabel("Import audio file").setInputFiles({
    name: "test-tone.wav",
    mimeType: "audio/wav",
    buffer: sineWav(),
  });
  await expect(
    page.getByRole("button", { name: "Export tuned audio" }),
  ).toBeEnabled();
}
async function setSlider(page: Page, name: string, value: number) {
  const slider = page.getByRole("slider", { name, exact: true });
  await slider.evaluate((element, number) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, String(number));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await expect(slider).toHaveValue(String(value));
}
async function exportWav(page: Page) {
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export tuned audio" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("test-tone-tuned.wav");
  const bytes = await readFile((await download.path())!);
  expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
  expect(bytes.toString("ascii", 8, 12)).toBe("WAVE");
  expect(bytes.readUInt32LE(4)).toBe(bytes.length - 8);
  const rate = bytes.readUInt32LE(24);
  const channels = bytes.readUInt16LE(22);
  const frames = bytes.readUInt32LE(40) / channels / 2;
  // Measure positive crossings in the stable middle second of the rendered tone.
  let crossings = 0;
  for (let i = rate / 2; i < rate * 1.5; i++) {
    if (
      bytes.readInt16LE(44 + (i - 1) * channels * 2) <= 0 &&
      bytes.readInt16LE(44 + i * channels * 2) > 0
    )
      crossings++;
  }
  return { duration: frames / rate, frequency: crossings };
}

test("imports, plays, seeks, tunes, and exports independent pitch and speed", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Find your other voice.",
  );
  await expect(
    page.getByRole("button", { name: "Play audio", exact: true }),
  ).toBeDisabled();
  await importTone(page);
  await page.getByRole("button", { name: "Play audio", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause audio", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause audio", exact: true }).click();
  await setSlider(page, "Seek audio", 0.5);
  await expect(page.getByRole("slider", { name: "Seek audio" })).toHaveValue(
    "0.5",
  );
  const original = await exportWav(page);
  expect(original.frequency).toBeGreaterThan(435);
  expect(original.frequency).toBeLessThan(445);
  expect(original.duration).toBeCloseTo(3, 1);
  await setSlider(page, "Pitch", -12);
  const lower = await exportWav(page);
  expect(lower.frequency).toBeGreaterThan(210);
  expect(lower.frequency).toBeLessThan(230);
  expect(lower.duration).toBeGreaterThan(3);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await setSlider(page, "Speed", 2);
  const faster = await exportWav(page);
  expect(faster.frequency).toBeGreaterThan(425);
  expect(faster.frequency).toBeLessThan(455);
  expect(faster.duration).toBeCloseTo(1.82, 1);
  await page.getByRole("switch", { name: "Echo", exact: true }).click();
  await page.getByRole("switch", { name: "Reverb", exact: true }).click();
  expect((await exportWav(page)).duration).toBeGreaterThan(3.5);
  await page.getByRole("button", { name: /Deep voice/ }).click();
  await expect(
    page.getByRole("slider", { name: "Pitch", exact: true }),
  ).toHaveValue("-5");
  await page.screenshot({
    path: "test-results/studio-desktop.png",
    fullPage: true,
  });
  expect(failures).toEqual([]);
});

test("negotiates MP4 for Safari and falls back to the browser default", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "MediaRecorder");
  try {
    Object.defineProperty(globalThis, "MediaRecorder", {
      configurable: true,
      value: { isTypeSupported: (type: string) => type === "audio/mp4" },
    });
    expect(getRecordingMimeType()).toBe("audio/mp4");
    Object.defineProperty(globalThis, "MediaRecorder", {
      configurable: true,
      value: { isTypeSupported: () => false },
    });
    expect(getRecordingMimeType()).toBeUndefined();
  } finally {
    if (original) Object.defineProperty(globalThis, "MediaRecorder", original);
    else Reflect.deleteProperty(globalThis, "MediaRecorder");
  }
});

test("records with tap and hold, releases the microphone, and handles invalid files", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop recording", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(700);
  await page
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Export tuned audio" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Start new session" }).click();
  const record = page.getByRole("button", {
    name: "Start recording",
    exact: true,
  });
  await record.hover();
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "Export tuned audio" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Start recording", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Import audio file").setInputFiles({
    name: "broken.wav",
    mimeType: "audio/wav",
    buffer: Buffer.from("bad audio"),
  });
  await expect(
    page.getByRole("alert").filter({ hasText: "could not be decoded" }),
  ).toBeVisible();
});

test("mobile layout, dialogs, and an offline reload work", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.screenshot({
    path: "test-results/studio-mobile.png",
    fullPage: true,
  });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Offline mode", { exact: true })).toBeVisible();
  await importTone(page);
  await expect(
    page.getByRole("button", { name: "Export tuned audio" }),
  ).toBeEnabled();
  await context.setOffline(false);
});

test("exports tuned MP4 audio and can cancel encoding", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await importTone(page);
  await page
    .getByRole("combobox", { name: "Export format" })
    .selectOption("mp4");
  await setSlider(page, "Pitch", -12);
  await setSlider(page, "Speed", 1.5);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export tuned audio" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("test-tone-tuned.mp4");
  const bytes = await readFile((await download.path())!);
  expect(bytes.toString("ascii", 4, 8)).toBe("ftyp");
  expect(bytes.includes(Buffer.from("mp4a"))).toBe(true);
  const audio = await page.evaluate(
    async (data) => {
      const context = new AudioContext();
      try {
        const buffer = await context.decodeAudioData(
          new Uint8Array(data).buffer,
        );
        const samples = buffer.getChannelData(0);
        let crossings = 0;
        for (
          let i = Math.floor(buffer.sampleRate / 2);
          i < Math.floor(buffer.sampleRate * 1.5);
          i++
        ) {
          if (samples[i - 1] <= 0 && samples[i] > 0) crossings++;
        }
        return { duration: buffer.duration, frequency: crossings };
      } finally {
        await context.close();
      }
    },
    [...bytes],
  );
  expect(audio.duration).toBeGreaterThan(2.2);
  expect(audio.duration).toBeLessThan(2.7);
  expect(audio.frequency).toBeGreaterThan(205);
  expect(audio.frequency).toBeLessThan(235);
  await page.getByRole("button", { name: "Export tuned audio" }).click();
  await page.getByRole("button", { name: "Cancel export" }).click();
  await expect(
    page.getByRole("button", { name: "Export tuned audio" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Cancel export" }),
  ).toBeHidden();
  expect(errors).toEqual([]);
});

test("keeps WAV available when the browser cannot encode MP4", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const supports = MediaRecorder.isTypeSupported.bind(MediaRecorder);
    MediaRecorder.isTypeSupported = (mime) =>
      !mime.includes("mp4") && supports(mime);
  });
  await page.goto("/");
  await expect(
    page.getByText("MP4 export isn’t supported in this browser."),
  ).toBeVisible();
  await expect(page.getByRole("option", { name: /MP4/ })).toHaveJSProperty(
    "disabled",
    true,
  );
  await importTone(page);
  expect((await exportWav(page)).frequency).toBeGreaterThan(435);
});
