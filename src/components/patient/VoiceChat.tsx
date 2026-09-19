"use client";

import { useEffect, useRef, useState } from "react";
import { hapticTap } from "@/lib/native";

interface VoiceChatProps {
  patientId: string;
}

async function convertBlobToMp3(rawBlob: Blob): Promise<{ mp3Blob: Blob; duration: number }> {
  const arrayBuffer = await rawBlob.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioContext = new AudioCtx();

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  const audioBuffer: AudioBuffer = await new Promise((resolve, reject) => {
    audioContext.decodeAudioData(
      arrayBuffer.slice(0),
      (buffer) => resolve(buffer),
      (err) => reject(err || new Error("Audio dekodlashda xatolik"))
    );
  });

  const duration = Math.round(audioBuffer.duration);
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = 1;
  const channelData = audioBuffer.getChannelData(0);

  if (audioBuffer.numberOfChannels > 1) {
    for (let c = 1; c < audioBuffer.numberOfChannels; c++) {
      const ch = audioBuffer.getChannelData(c);
      for (let i = 0; i < channelData.length; i++) {
        channelData[i] = (channelData[i] + ch[i]) / 2;
      }
    }
  }

  const samples = new Int16Array(channelData.length);
  for (let i = 0; i < channelData.length; i++) {
    const s = Math.max(-1, Math.min(1, channelData[i]));
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const encoder = new Mp3Encoder(numChannels, sampleRate, 128);
  const mp3Chunks: Uint8Array[] = [];
  const chunkSize = 1152;

  for (let i = 0; i < samples.length; i += chunkSize) {
    const chunk = samples.subarray(i, i + chunkSize);
    const mp3buf = encoder.encodeBuffer(chunk);
    if (mp3buf.length > 0) {
      mp3Chunks.push(new Uint8Array(mp3buf));
    }
  }

  const lastChunk = encoder.flush();
  if (lastChunk.length > 0) {
    mp3Chunks.push(new Uint8Array(lastChunk));
  }

  try {
    await audioContext.close();
  } catch {
    // Ignore close errors
  }

  const mp3Blob = new Blob(mp3Chunks as BlobPart[], { type: "audio/mpeg" });
  return { mp3Blob, duration: duration || 1 };
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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
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
    };
  }, [audioUrl]);

  async function startRecording() {
    setErrorMessage(null);
    setSentSuccess(false);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      let mimeType = "audio/webm;codecs=opus";
      if (typeof MediaRecorder !== "undefined") {
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
            mimeType = "audio/ogg;codecs=opus";
          } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
            mimeType = "audio/mp4";
          } else {
            mimeType = "";
          }
        }
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());

        const type = recorder.mimeType || "audio/webm";
        const rawBlob = new Blob(audioChunksRef.current, { type });

        try {
          setIsConverting(true);
          const { mp3Blob, duration } = await convertBlobToMp3(rawBlob);
          setAudioBlob(mp3Blob);
          setRecordedDuration(duration);
          const url = URL.createObjectURL(mp3Blob);
          setAudioUrl(url);
        } catch (convErr) {
          console.warn("MP3 conversion failed, fallback to raw audio:", convErr);
          setAudioBlob(rawBlob);
          setRecordedDuration(recordSeconds);
          const url = URL.createObjectURL(rawBlob);
          setAudioUrl(url);
        } finally {
          setIsConverting(false);
        }
      };

      recorder.start(200);
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
      setErrorMessage("Mikrofondan foydalanishga ruxsat berilmadi yoki mikrofon topilmadi.");
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      hapticTap();
    }
    setRecording(false);
  }

  function cancelRecording() {
    stopRecording();
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setAudioBlob(null);
    setRecordSeconds(0);
    setRecordedDuration(0);
    setIsConverting(false);
    setErrorMessage(null);
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
      formData.append("audio", audioBlob, isMp3 ? "voice.mp3" : "voice.ogg");
      formData.append("duration", String(recordedDuration || recordSeconds || 1));

      const res = await fetch("/api/patient/voice-message", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
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
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
          <span>⚠️</span>
          <span className="flex-1">{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="font-semibold underline">
            Yopish
          </button>
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

