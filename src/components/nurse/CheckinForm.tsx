"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BackButton from "@/components/BackButton";
import { ErrorBanner, callApi } from "@/components/nurse/shared";

interface CheckinPatient {
  id: string;
  full_name: string;
  tuman: string;
  village: string;
  diagnosis: string;
  drug_name: string;
  dosage: string;
  completed_at: string | null;
}

interface CheckinResult {
  matchPercent: number;
  status: "on_track" | "deviation";
  recommendation: string;
}

// Daily check-in questionnaire (Ha / Yoʻq) → AI match score against the expected trajectory.
export default function CheckinForm({ patientId }: { patientId: string }) {
  const [patient, setPatient] = useState<CheckinPatient | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckinResult | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await callApi<{ patient: CheckinPatient; questions: string[] }>(`/api/checkins?patientId=${patientId}`);
      setPatient(data.patient);
      setQuestions(data.questions);
      setLoadError(null);
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, [patientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const data = await callApi<{ score: CheckinResult }>("/api/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, answers }),
      });
      setResult(data.score);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const allAnswered = questions.length > 0 && questions.every((q) => q in answers);
  const answered = questions.filter((q) => q in answers).length;

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <TopBar />
      <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-4 sm:px-6">
        <BackButton fallbackHref="/nurse?tab=patients" label="Orqaga" />

        {loadError ? (
          <ErrorBanner message={loadError} onRetry={() => void load()} />
        ) : !patient ? (
          <div className="space-y-3" aria-busy="true" aria-label="Yuklanmoqda">
            <div className="h-16 animate-pulse rounded-2xl bg-gray-100" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 text-lg font-bold text-white" aria-hidden="true">
                {patient.full_name.charAt(0)}
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold text-gray-900">{patient.full_name}</h1>
                <p className="truncate text-sm text-gray-500">
                  {patient.village}, {patient.tuman} · {patient.diagnosis}
                </p>
              </div>
            </div>

            {result ? (
              <section
                role="status"
                className={`rounded-3xl border p-6 shadow-sm ${result.status === "on_track" ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}
              >
                <p className="text-4xl" aria-hidden="true">{result.status === "on_track" ? "✅" : "⚠️"}</p>
                <h2 className={`mt-2 text-lg font-bold ${result.status === "on_track" ? "text-emerald-800" : "text-red-800"}`}>
                  Tekshiruv yuborildi — moslik {result.matchPercent}%
                </h2>
                <p className={`text-sm font-semibold ${result.status === "on_track" ? "text-emerald-700" : "text-red-700"}`}>
                  {result.status === "on_track" ? "Yaxshi holat: davolanish rejaga mos" : "Chetlanish aniqlandi"}
                </p>
                <p className="mt-3 text-sm text-gray-700">{result.recommendation}</p>
                {result.status === "deviation" && (
                  <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-sm font-medium text-red-700">
                    Shifokorga avtomatik xabarnoma yuborildi.
                  </p>
                )}
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link href="/nurse?tab=patients" className="inline-flex min-h-12 items-center rounded-xl bg-teal-600 px-5 text-sm font-bold text-white hover:bg-teal-700">
                    Bemorlarimga qaytish
                  </Link>
                  <Link href="/nurse" className="inline-flex min-h-12 items-center rounded-xl border border-gray-200 bg-white px-5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    Vazifalar
                  </Link>
                </div>
              </section>
            ) : patient.completed_at ? (
              <p className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-6 text-center text-gray-500">
                Bu bemorning davolanishi yakunlangan — tekshiruv talab qilinmaydi.
              </p>
            ) : questions.length === 0 ? (
              <p className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-6 text-center text-gray-500">
                Bu bemor uchun nazorat savollari topilmadi.
              </p>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-base font-bold text-gray-800">Bugungi nazorat soʻrovnomasi</h2>
                  <span className="text-xs font-semibold text-gray-500">
                    {answered}/{questions.length}
                  </span>
                </div>
                {questions.map((q) => (
                  <fieldset key={q} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <legend className="sr-only">{q}</legend>
                    <p className="mb-3 font-medium text-gray-800">{q}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        aria-pressed={answers[q] === true}
                        onClick={() => setAnswers({ ...answers, [q]: true })}
                        className={`min-h-12 rounded-xl border-2 font-semibold transition ${
                          answers[q] === true ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        Ha
                      </button>
                      <button
                        type="button"
                        aria-pressed={answers[q] === false}
                        onClick={() => setAnswers({ ...answers, [q]: false })}
                        className={`min-h-12 rounded-xl border-2 font-semibold transition ${
                          answers[q] === false ? "border-red-500 bg-red-50 text-red-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        Yoʻq
                      </button>
                    </div>
                  </fieldset>
                ))}

                {error && (
                  <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!allAnswered || submitting}
                  className="min-h-14 w-full rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-500 px-5 font-bold text-white shadow-md transition hover:from-teal-700 hover:to-cyan-600 disabled:opacity-50"
                >
                  {submitting ? "⏳ AI baholamoqda..." : "Yuborish"}
                </button>
                {!allAnswered && <p className="text-center text-xs text-gray-500">Yuborish uchun barcha savollarga javob bering.</p>}
              </form>
            )}
          </>
        )}
      </main>
    </div>
  );
}
