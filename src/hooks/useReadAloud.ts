"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SpokenSegment = { id: string; text: string };
type PlaybackState = "idle" | "playing" | "paused";

function splitIntoChunks(value: string, max = 210): string[] {
  const text = value.replace(/\s+/g, " ").trim();
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > max) {
    const min = Math.floor(max * .55);
    const part = remaining.slice(0, max + 1);
    const punctuation = Math.max(part.lastIndexOf(". "), part.lastIndexOf("? "), part.lastIndexOf("! "), part.lastIndexOf("; "), part.lastIndexOf(", "));
    const space = part.lastIndexOf(" ");
    const boundary = punctuation >= min ? punctuation + 1 : space >= min ? space : max;
    chunks.push(remaining.slice(0, boundary).trim());
    remaining = remaining.slice(boundary).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

/** Browser-native TTS; no external service, key, or book upload required. */
export function useReadAloud() {
  const [state, setState] = useState<PlaybackState>("idle");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const [available, setAvailable] = useState(false);
  const runId = useRef(0);
  const speedRef = useRef(1);

  useEffect(() => {
    setAvailable(typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window);
    return () => {
      runId.current += 1;
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    runId.current += 1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setState("idle");
    setActiveId(null);
  }, []);

  const updateSpeed = useCallback((next: number) => {
    const clamped = Math.max(.7, Math.min(1.5, next));
    speedRef.current = clamped;
    setSpeed(clamped);
  }, []);

  const play = useCallback((segments: SpokenSegment[]) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const queue = segments.flatMap(segment => splitIntoChunks(segment.text).map(text => ({ id: segment.id, text })));
    stop();
    if (!queue.length) return;
    const run = runId.current;
    const synthesis = window.speechSynthesis;
    let index = 0;
    const speakNext = () => {
      if (run !== runId.current) return;
      if (index >= queue.length) {
        setState("idle");
        setActiveId(null);
        return;
      }
      const next = queue[index++];
      const utterance = new SpeechSynthesisUtterance(next.text);
      utterance.lang = "vi-VN";
      utterance.rate = speedRef.current;
      const voices = synthesis.getVoices();
      const vietnamese = voices.find(v => v.lang.toLowerCase().startsWith("vi"));
      if (vietnamese) utterance.voice = vietnamese;
      setActiveId(next.id);
      utterance.onend = speakNext;
      utterance.onerror = () => {
        if (run === runId.current) speakNext();
      };
      synthesis.speak(utterance);
    };
    setState("playing");
    speakNext();
  }, [stop]);

  const pauseOrResume = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    if (state === "playing") {
      synth.pause(); setState("paused");
    } else if (state === "paused") {
      synth.resume(); setState("playing");
    }
  }, [state]);

  return { state, activeId, speed, available, play, stop, pauseOrResume, updateSpeed };
}
