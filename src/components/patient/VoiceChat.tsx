"use client";

import { useEffect, useRef, useState } from "react";
import { hapticTap } from "@/lib/native";

interface VoiceChatProps {
  patientId: string;
}

export default function VoiceChat({ patientId }: VoiceChatProps) {
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [isConverting, setIsConverting] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const fallbackChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [audioUrl]);

  async function startRecording() {
    setErrorMessage(null);
    setSentSuccess(false);
    pcmChunksRef.current = [];
    fallbackChunksRef.current = [];

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Ushbu qurilma yoki brauzerda mikrofon qoʻllab-quvvatlanmaydi.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // Direct Web Audio API PCM capture (works on all modern mobile and desktop browsers)
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        pcmChunksRef.current.push(new Float32Array(inputData));
      };

      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0;

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioCtx.destination);
      scriptProcessorRef.current = processor;

      // Optional MediaRecorder fallback
      try {
        if (typeof MediaRecorder !== "undefined") {
          const mr = new MediaRecorder(stream);
          mr.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              fallbackChunksRef.current.push(e.data);
            }
          };
          mr.start(250);
          mediaRecorderRef.current = mr;
        }
      } catch {
        // MediaRecorder is optional fallback
      }

      hapticTap();
      setRecording(true);
      setRecordSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordSeconds((s) => {
          if (s >= 120) {
            stopRecording();
            return s;
          }
          return s + 1;
        });
      }, 1000);
    } catch (err) {
      console.error("Microphone access error:", err);
      const msg = (err as Error).name === "NotAllowedError"
        ? "Mikrofondan foydalanishga ruxsat berilmadi. Iltimos, brauzer sozlamalarida mikrofonga ruxsat bering."
        : "Mikrofon topilmadi yoki ulanishda xatolik yuz berdi.";
      setErrorMessage(msg);
    }
  }

  async function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setRecording(false);
    hapticTap();
    setIsConverting(true);

    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }

      if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
      }

      const audioCtx = audioContextRef.current;
      const sampleRate = audioCtx ? audioCtx.sampleRate : 44100;

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }

      if (audioCtx && audioCtx.state !== "closed") {
        try {
          await audioCtx.close();
        } catch {
          // ignore
        }
        audioContextRef.current = null;
      }

      const pcmChunks = pcmChunksRef.current;
      const totalSamples = pcmChunks.reduce((acc, c) => acc + c.length, 0);

      if (totalSamples > 0) {
        // Convert Float32Array PCM to Int16Array
        const samples = new Int16Array(totalSamples);
        let offset = 0;
        for (const chunk of pcmChunks) {
          for (let i = 0; i < chunk.length; i++) {
            const s = Math.max(-1, Math.min(1, chunk[i]));
            samples[offset++] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
        }

        // Direct pure JavaScript MP3 encoding
        const { Mp3Encoder } = await import("@breezystack/lamejs");
        const encoder = new Mp3Encoder(1, sampleRate, 128);
        const mp3Chunks: Uint8Array[] = [];
        const chunkSize = 1152;

        for (let i = 0; i < samples.length; i += chunkSize) {
          const chunk = samples.subarray(i, i + chunkSize);
          const buf = encoder.encodeBuffer(chunk);
          if (buf.length > 0) {
            mp3Chunks.push(new Uint8Array(buf));
          }
        }

        const lastChunk = encoder.flush();
        if (lastChunk.length > 0) {
          mp3Chunks.push(new Uint8Array(lastChunk));
        }

        const mp3Blob = new Blob(mp3Chunks as BlobPart[], { type: "audio/mpeg" });
        const calcDuration = Math.max(1, Math.round(totalSamples / sampleRate));
        setAudioBlob(mp3Blob);
        setRecordedDuration(calcDuration);
        const url = URL.createObjectURL(mp3Blob);
        setAudioUrl(url);
      } else if (fallbackChunksRef.current.length > 0) {
        const fallbackBlob = new Blob(fallbackChunksRef.current, {
          type: mediaRecorderRef.current?.mimeType || "audio/webm",
        });
        setAudioBlob(fallbackBlob);
        setRecordedDuration(Math.max(1, recordSeconds));
        const url = URL.createObjectURL(fallbackBlob);
        setAudioUrl(url);
      } else {
        setErrorMessage("Ovoz yozilmadi. Iltimos, mikrofonga ruxsat berilganligini tekshiring.");
      }
    } catch (err) {
      console.error("Audio recording processing error:", err);
      setErrorMessage("Ovozni qayta ishlashda xatolik yuz berdi.");
    } finally {
      setIsConverting(false);
    }
  }

  function cancelRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    pcmChunksRef.current = [];
    fallbackChunksRef.current = [];
    setAudioBlob(null);
    setRecordSeconds(0);
    setRecordedDuration(0);
    setRecording(false);
    setIsConverting(false);
    setIsPlaying(false);
    setErrorMessage(null);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setSentSuccess(false);
    setAudioBlob(file);
    const url = URL.createObjectURL(file);
    setAudioUrl(url);

    const tempAudio = new Audio(url);
    tempAudio.onloadedmetadata = () => {
      if (tempAudio.duration && isFinite(tempAudio.duration)) {
        const d = Math.round(tempAudio.duration);
        setRecordedDuration(d);
        setRecordSeconds(d);
      }
    };

    hapticTap();
    e.target.value = "";
  }

  function togglePlay() {
    if (!audioPlayerRef.current) return;
    if (isPlaying) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
    } else {
      audioPlayerRef.current.play();
      setIsPlaying(true);
    }
  }

  async function sendVoiceMessage() {
    if (!audioBlob || sending) return;
    setSending(true);
    setErrorMessage(null);
    hapticTap();

    try {
      const formData = new FormData();
      formData.append("patientId", patientId);
      const isMp3 = audioBlob.type.includes("mpeg") || audioBlob.type.includes("mp3");
      const isM4a = audioBlob.type.includes("m4a") || audioBlob.type.includes("mp4");
      const filename = isMp3 ? "voice.mp3" : isM4a ? "voice.m4a" : "voice.ogg";
      formData.append("audio", audioBlob, filename);
      formData.append("duration", String(recordedDuration || recordSeconds || 1));

      const res = await fetch("/api/patient/voice-message", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "Xabarni yuborishda xatolik yuz berdi");
      }

      setSentSuccess(true);
      cancelRecording();
      hapticTap();
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  const formatSec = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50/50 via-white to-cyan-50/30 p-4 shadow-sm">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white text-base shadow-sm">
          🎙️
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-800">Shifokorga ovozli xabar</h3>
          <p className="text-xs text-gray-500">
            Savol yoki holatingizni ovoz orqali toʻgʻridan-toʻgʻri shifokorga yuboring
          </p>
        </div>
      </div>

      {errorMessage && (
        <div className="mb-3 space-y-2.5 rounded-xl border border-amber-200 bg-amber-50/85 p-3 text-xs text-amber-900">
          <div className="flex items-start gap-2">
            <span className="text-base">⚠️</span>
            <div className="flex-1">
              <p className="font-semibold text-amber-900">{errorMessage}</p>
              <p className="text-[11px] text-amber-700 mt-1">
                Brauzer mikrofonga ruxsat bermasa, telefoningizning oʻz diktofon ilovasi orqali ovoz yozishingiz mumkin:
              </p>
            </div>
            <button onClick={() => setErrorMessage(null)} className="font-bold text-amber-800">
              ✕
            </button>
          </div>

          <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-teal-600 py-2.5 px-3 text-xs font-bold text-white shadow-sm hover:bg-teal-700 transition active:scale-[0.98]">
            <span>📱</span>
            <span>Telefon diktofoni orqali yozish</span>
            <input
              type="file"
              accept="audio/*"
              capture="user"
              onChange={handleFileInput}
              className="hidden"
            />
          </label>
        </div>
      )}

      {sentSuccess && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          <span className="text-base">✅</span>
          <div className="flex-1">
            <p className="font-bold">Ovozli xabaringiz shifokorga yuborildi!</p>
            <p className="text-[11px] text-emerald-600 mt-0.5">
              Shifokor xabarni Telegram orqali eshitadi va kerak boʻlsa aloqaga chiqadi.
            </p>
          </div>
        </div>
      )}

      {!recording && isConverting && (
        <div className="flex items-center justify-center gap-2.5 rounded-xl border border-teal-200 bg-teal-50/50 py-3.5 px-4 text-xs font-medium text-teal-800">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
          <span>Ovoz tayyorlanmoqda...</span>
        </div>
      )}

      {!recording && !isConverting && !audioBlob && (
        <div className="space-y-2">
          <button
            onClick={startRecording}
            type="button"
            className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-teal-600 py-3 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 active:scale-[0.98]"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">
              🎙️
            </span>
            <span>Ovozli xabar yozish</span>
          </button>

          <div className="flex items-center gap-2">
            <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50/80 py-2.5 px-3 text-xs font-semibold text-teal-800 hover:bg-teal-100 transition active:scale-[0.98]">
              <span>📱</span>
              <span>Telefon diktofonidan yozish</span>
              <input
                type="file"
                accept="audio/*"
                capture="user"
                onChange={handleFileInput}
                className="hidden"
              />
            </label>

            <label className="cursor-pointer flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white py-2.5 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 transition active:scale-[0.98]">
              <span>📁</span>
              <span>Fayldan</span>
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileInput}
                className="hidden"
              />
            </label>
          </div>
        </div>
      )}

      {recording && (
        <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/50 p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3.5 w-3.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-red-600" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-red-700">
                Yozilmoqda...
              </span>
            </div>
            <span className="font-mono text-sm font-bold text-red-700">
              {formatSec(recordSeconds)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={cancelRecording}
              type="button"
              className="flex-1 rounded-xl border border-gray-200 bg-white py-2 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Bekor qilish
            </button>
            <button
              onClick={stopRecording}
              type="button"
              className="flex-1 rounded-xl bg-red-600 py-2 px-3 text-xs font-bold text-white shadow-sm hover:bg-red-700"
            >
              ⏹️ Toʻxtatish
            </button>
          </div>
        </div>
      )}

      {!recording && !isConverting && audioBlob && audioUrl && (
        <div className="space-y-3 rounded-xl border border-teal-200 bg-white p-3.5 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm transition hover:bg-teal-700"
            >
              {isPlaying ? "⏸️" : "▶️"}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-gray-700">Ovoz yozuvi</span>
                <span className="font-mono text-gray-500">{formatSec(recordSeconds)}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-teal-100 overflow-hidden">
                <div
                  className={`h-full bg-teal-500 rounded-full transition-all duration-300 ${
                    isPlaying ? "w-full animate-pulse" : "w-1/2"
                  }`}
                />
              </div>
            </div>
            <audio
              ref={audioPlayerRef}
              src={audioUrl}
              onEnded={() => setIsPlaying(false)}
              className="hidden"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={cancelRecording}
              type="button"
              disabled={sending}
              className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              🔄 Qaytadan yozish
            </button>
            <button
              onClick={sendVoiceMessage}
              type="button"
              disabled={sending}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 py-2.5 px-3 text-xs font-bold text-white shadow-sm hover:from-teal-700 hover:to-cyan-700 active:scale-[0.98] disabled:opacity-50"
            >
              {sending ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Yuborilmoqda...</span>
                </>
              ) : (
                <>
                  <span>Yuborish</span>
                  <span>↗️</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <p className="mt-2.5 text-center text-[10px] text-gray-400">
        Ovozli xabar shifokorning Telegram botiga bevosita yetkaziladi
      </p>
    </div>
  );
}

