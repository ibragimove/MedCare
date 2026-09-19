"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BackButton from "@/components/BackButton";
import { Countdown, ErrorBanner, SeverityBadge, StatusPill, callApi, useNow } from "@/components/nurse/shared";
import HoldatiYomon from "@/components/nurse/HoldatiYomon";
import { Card, Empty, Field, INPUT } from "@/components/patient-detail/ui";
import { ACCEPTABLE, WORKABLE, isTaskOverdue, mapsHref, telHref } from "@/lib/nurse-ui";
import { fmtDateTime } from "@/lib/patient-status";
import { OTP_COOLDOWN_SECONDS, type NurseTaskDetailResponse } from "@/types/nurse";

type SaveState = "idle" | "saving" | "saved" | "local" | "error";

function ageOf(birth: string | null): string | null {
  if (!birth) return null;
  const b = new Date(birth);
  if (Number.isNaN(b.getTime())) return null;
  const years = Math.floor((Date.now() - b.getTime()) / (365.25 * 86_400_000));
  return years >= 0 && years < 130 ? `${years} yosh` : null;
}

const STEPS = ["Qabul qilish", "Tashrif", "Tasdiqlash"];

function StepIndicator({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="flex items-center" aria-label="Bosqichlar">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = current > n;
        const active = current === n;
        return (
          <li key={label} className="flex flex-1 items-center last:flex-none" aria-current={active ? "step" : undefined}>
            <div className="flex flex-col items-center gap-1">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                  done ? "bg-emerald-500 text-white" : active ? "bg-teal-600 text-white ring-4 ring-teal-100" : "bg-gray-200 text-gray-500"
                }`}
              >
                {done ? "✓" : n}
              </span>
              <span className={`text-[11px] font-semibold ${active ? "text-teal-700" : "text-gray-500"}`}>{label}</span>
            </div>
            {n < STEPS.length && <span className={`mx-1 mb-5 h-0.5 flex-1 ${done ? "bg-emerald-400" : "bg-gray-200"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

export default function TaskDetail({ taskId }: { taskId: string }) {
  const [data, setData] = useState<NurseTaskDetailResponse | null>(null);
  const [loadError, setLoadError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [skewMs, setSkewMs] = useState(0);
  const now = useNow(1_000, skewMs);

  // Editable visit state (initialised once from the server, then owned by the form).
  const [ticks, setTicks] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const initialised = useRef(false);
  const pendingSave = useRef<{ checklist_done?: string[]; visit_notes?: string }>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Accept / OTP / complete
  const [accepting, setAccepting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [codeActive, setCodeActive] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [requesting, setRequesting] = useState(false);
  const [otpInfo, setOtpInfo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await callApi<NurseTaskDetailResponse>(`/api/care-tasks/${taskId}`);
      setData(res);
      setSkewMs(new Date(res.serverNow).getTime() - Date.now());
      setLoadError(null);
      if (!initialised.current) {
        initialised.current = true;
        setTicks(res.task.checklist_done);
        setNotes(res.task.visit_notes ?? "");
        setCodeActive(res.otp.issuedAt !== null);
        setAttemptsLeft(res.otp.issuedAt !== null ? res.otp.attemptsLeft : null);
        setCooldownUntil(Date.now() + res.otp.cooldownSeconds * 1000);
        if (res.task.status === "confirmed") setDone(true);
      } else if (res.task.status === "confirmed") {
        setDone(true);
      }
    } catch (err) {
      const e = err as Error & { status?: number };
      setLoadError({ message: e.message, notFound: e.status === 404 });
    }
  }, [taskId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  // Autosave: ticks and notes are written a moment after the last change.
  const flushSave = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const body = pendingSave.current;
    if (Object.keys(body).length === 0) return;
    pendingSave.current = {};
    setSaveState("saving");
    try {
      const res = await callApi<{ checklistPersisted?: boolean }>(`/api/care-tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setSaveState(res.checklistPersisted === false ? "local" : "saved");
    } catch {
      pendingSave.current = { ...body, ...pendingSave.current };
      setSaveState("error");
    }
  }, [taskId]);

  function scheduleSave(patch: { checklist_done?: string[]; visit_notes?: string }) {
    pendingSave.current = { ...pendingSave.current, ...patch };
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flushSave(), 700);
  }

  useEffect(
    () => () => {
      // Leaving the screen: push out whatever has not been saved yet.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const body = pendingSave.current;
      if (Object.keys(body).length > 0) {
        void fetch(`/api/care-tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          keepalive: true,
        });
      }
    },
    [taskId],
  );

  const task = data?.task;
  const status = task?.status;
  const confirmed = done || status === "confirmed";
  const workable = status ? WORKABLE.has(status) : false;
  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now.getTime()) / 1000));

  async function accept() {
    if (!data || accepting) return;
    setAccepting(true);
    setActionError(null);
    const previous = data;
    setData({ ...data, task: { ...data.task, status: "accepted", accepted_at: new Date().toISOString() } });
    try {
      await callApi(`/api/care-tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
    } catch (err) {
      setData(previous);
      setActionError((err as Error).message);
    } finally {
      setAccepting(false);
      void load();
    }
  }

  function toggleTick(item: string) {
    const next = ticks.includes(item) ? ticks.filter((t) => t !== item) : [...ticks, item];
    setTicks(next);
    scheduleSave({ checklist_done: next });
  }

  async function requestCode() {
    if (requesting || cooldownLeft > 0) return;
    setRequesting(true);
    setOtpError(null);
    setOtpInfo(null);
    try {
      const res = await callApi<{ delivered: { portal: boolean; telegram: boolean } }>(`/api/care-tasks/${taskId}/otp`, {
        method: "POST",
      });
      setCodeActive(true);
      setAttemptsLeft(5);
      setCode("");
      setCooldownUntil(Date.now() + OTP_COOLDOWN_SECONDS * 1000);
      const where = [res.delivered.portal && "shaxsiy kabineti", res.delivered.telegram && "Telegrami"].filter(Boolean).join(" va ");
      setOtpInfo(`Kod bemorning ${where}ga yuborildi. Bemordan 6 xonali kodni ovoz chiqarib oʻqib berishini soʻrang.`);
    } catch (err) {
      const e = err as Error & { data?: { retryAfter?: number } };
      if (e.data?.retryAfter) setCooldownUntil(Date.now() + e.data.retryAfter * 1000);
      setOtpError(e.message);
    } finally {
      setRequesting(false);
    }
  }

  async function complete() {
    if (completing || code.length !== 6) return;
    setCompleting(true);
    setOtpError(null);
    try {
      await callApi(`/api/care-tasks/${taskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp_code: code, notes, checklist_done: ticks }),
      });
      pendingSave.current = {};
      setDone(true);
      void load();
    } catch (err) {
      const e = err as Error & { data?: { attemptsLeft?: number } };
      setOtpError(e.message);
      if (typeof e.data?.attemptsLeft === "number") {
        setAttemptsLeft(e.data.attemptsLeft);
        if (e.data.attemptsLeft === 0) setCodeActive(false);
      }
      setCode("");
    } finally {
      setCompleting(false);
    }
  }

  const step: 1 | 2 | 3 | 4 = confirmed ? 4 : status && ACCEPTABLE.has(status) ? 1 : codeActive ? 3 : 2;

  const header = (
    <div className="mb-4 flex items-center justify-between gap-2">
      <BackButton fallbackHref="/nurse" label="Orqaga" />
      {data && (
        <Link
          href={`/nurse/patients/${data.patient.id}`}
          className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-teal-700 hover:bg-teal-50"
        >
          Bemor maʼlumotlari →
        </Link>
      )}
    </div>
  );

  if (loadError && !data) {
    return (
      <div className="min-h-screen bg-slate-50">
        <TopBar />
        <main className="mx-auto w-full max-w-2xl px-4 py-4">
          <div className="mb-4">
            <BackButton fallbackHref="/nurse" />
          </div>
          {loadError.notFound ? (
            <Empty icon="🔍" text="Vazifa topilmadi yoki sizga tegishli emas" />
          ) : (
            <ErrorBanner message={loadError.message} onRetry={() => void load()} />
          )}
        </main>
      </div>
    );
  }

  if (!data || !task) {
    return (
      <div className="min-h-screen bg-slate-50">
        <TopBar />
        <main className="mx-auto w-full max-w-2xl space-y-3 px-4 py-4" aria-busy="true" aria-label="Yuklanmoqda">
          <div className="h-11 w-28 animate-pulse rounded-xl bg-gray-200" />
          {[36, 24, 48].map((h) => (
            <div key={h} className="animate-pulse rounded-3xl bg-gray-100" style={{ height: h * 4 }} />
          ))}
        </main>
      </div>
    );
  }

  const { patient, ai, medications, otp } = data;
  const tel = telHref(patient.phone);
  const late = isTaskOverdue(task, now);
  const age = ageOf(patient.birth_date);

  const completeBlockReason =
    status && ACCEPTABLE.has(status)
      ? "Avval vazifani qabul qiling"
      : !codeActive
        ? "Avval bemorga tasdiqlash kodini yuboring"
        : code.length !== 6
          ? "Bemor aytgan 6 xonali kodni kiriting"
          : null;

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <TopBar />
      <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4 sm:px-6">
        {header}

        {/* Patient */}
        <section className={`rounded-3xl border p-5 shadow-sm ${late && !confirmed ? "border-red-300 bg-red-50/60" : "border-teal-100 bg-white"}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-gray-900">{patient.full_name}</h1>
              <p className="text-sm text-gray-600">
                {patient.village}, {patient.tuman}
                {age ? ` · ${age}` : ""}
              </p>
            </div>
            <SeverityBadge severity={task.severity} />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <StatusPill status={task.status} late={late} />
            {confirmed ? (
              <span className="text-sm font-semibold text-emerald-700">✅ {fmtDateTime(task.confirmed_at)}</span>
            ) : (
              <Countdown task={task} now={now} />
            )}
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Tashxis">{patient.diagnosis}</Field>
            {patient.address && <Field label="Manzil">{patient.address}</Field>}
            <Field label="Dorilar">
              {medications.length === 0 ? (
                "—"
              ) : (
                <ul className="space-y-0.5">
                  {medications.map((m, i) => (
                    <li key={`${m.drug_name}-${i}`}>
                      {m.drug_name}
                      {m.dosage ? ` — ${m.dosage}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </Field>
            <Field label="SLA muddati">{fmtDateTime(task.sla_deadline)}</Field>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {tel && (
              <a href={tel} aria-label={`${patient.full_name} ga qoʻngʻiroq qilish`} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                📞 Qoʻngʻiroq
              </a>
            )}
            <a href={mapsHref(patient)} target="_blank" rel="noopener noreferrer" aria-label="Manzilni xaritada ochish" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              📍 Xarita
            </a>
            {!patient.completed_at && (
              <Link href={`/nurse/checkin/${patient.id}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-4 text-sm font-semibold text-teal-800 hover:bg-teal-100">
                📝 Kunlik tekshiruv
              </Link>
            )}
          </div>
        </section>

        {actionError && <ErrorBanner message={actionError} />}

        {!confirmed && (
          <section className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
            <StepIndicator current={step} />
          </section>
        )}

        {status && ACCEPTABLE.has(status) && !confirmed && (
          <button
            type="button"
            onClick={() => void accept()}
            disabled={accepting}
            className="min-h-14 w-full rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-500 px-4 text-base font-bold text-white shadow-md transition hover:from-teal-700 hover:to-cyan-600 active:scale-[0.99] disabled:opacity-60"
          >
            {accepting ? "Saqlanmoqda..." : "✔ Qabul qildim"}
          </button>
        )}

        {!confirmed && !patient.completed_at && (
          <HoldatiYomon patientId={patient.id} taskId={task.id} patientName={patient.full_name} />
        )}

        {/* AI brief */}
        <Card title="AI qisqacha maʼlumot">
          {!ai ? (
            <Empty icon="🤖" text="AI xulosa hali tayyor emas" />
          ) : (
            <div className="space-y-4">
              {ai.risk_score !== null && (
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-gray-700">Xavf balli</span>
                    <span className={`font-bold ${ai.risk_score >= 70 ? "text-red-600" : ai.risk_score >= 40 ? "text-amber-600" : "text-emerald-600"}`}>
                      {ai.risk_score}/100
                    </span>
                  </div>
                  <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={ai.risk_score} aria-valuemin={0} aria-valuemax={100} aria-label="Xavf balli">
                    <div
                      className={`h-full rounded-full ${ai.risk_score >= 70 ? "bg-red-500" : ai.risk_score >= 40 ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${ai.risk_score}%` }}
                    />
                  </div>
                </div>
              )}
              {ai.brief_uz && <p className="whitespace-pre-line text-sm leading-relaxed text-gray-800">{ai.brief_uz}</p>}
              {ai.main_concerns.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400">Asosiy xavotirlar</h4>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-800">
                    {ai.main_concerns.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {ai.home_care_tasks.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400">Uyda parvarish</h4>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-800">
                    {ai.home_care_tasks.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Checklist */}
        <Card
          title="Tashrif nazorat roʻyxati"
          action={
            !confirmed && (
              <span className="text-xs text-gray-400" role="status">
                {saveState === "saving" && "Saqlanmoqda..."}
                {saveState === "saved" && "Saqlandi ✓"}
                {saveState === "local" && "Faqat shu ekranda"}
                {saveState === "error" && <span className="text-red-600">Saqlanmadi</span>}
              </span>
            )
          }
        >
          {!ai || ai.checklist_uz.length === 0 ? (
            <Empty icon="📋" text="Bu vazifa uchun nazorat roʻyxati yoʻq" />
          ) : (
            <>
              {!confirmed && !workable && (
                <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">Bandlarni belgilash uchun avval vazifani qabul qiling.</p>
              )}
              <ul className="space-y-2">
                {ai.checklist_uz.map((item) => {
                  const checked = ticks.includes(item);
                  const disabled = confirmed || !workable;
                  return (
                    <li key={item}>
                      <label className={`flex min-h-12 items-start gap-3 rounded-xl border px-3 py-3 text-sm ${checked ? "border-teal-200 bg-teal-50" : "border-gray-200 bg-white"} ${disabled ? "opacity-70" : "cursor-pointer hover:bg-gray-50"}`}>
                        <input
                          type="checkbox"
                          className="mt-0.5 h-5 w-5 shrink-0 accent-teal-600"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleTick(item)}
                        />
                        <span className={checked ? "text-gray-600 line-through decoration-teal-400" : "text-gray-800"}>{item}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-xs text-gray-400">
                {ticks.length}/{ai.checklist_uz.length} bajarildi
                {!task.checklist_persisted && " · Belgilar saqlanishi uchun maʼlumotlar bazasi yangilanishi kerak"}
              </p>
            </>
          )}
        </Card>

        {/* Notes */}
        <Card title="Tashrif izohlari">
          <textarea
            rows={4}
            maxLength={2000}
            className={INPUT}
            value={notes}
            disabled={confirmed || !workable}
            onChange={(e) => {
              setNotes(e.target.value);
              scheduleSave({ visit_notes: e.target.value });
            }}
            placeholder={workable || confirmed ? "Bemor holati, bosim, harorat, dorilar qabuli..." : "Izoh yozish uchun avval vazifani qabul qiling"}
            aria-label="Tashrif izohlari"
          />
        </Card>

        {/* Completion */}
        {confirmed ? (
          <section role="status" className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <p className="text-4xl" aria-hidden="true">✅</p>
            <h2 className="mt-2 text-lg font-bold text-emerald-800">Tashrif tasdiqlandi</h2>
            <p className="mt-1 text-sm text-emerald-700">
              {task.confirmed_at ? `${fmtDateTime(task.confirmed_at)} · ` : ""}
              Rahmat! Maʼlumot menejer va shifokorga yetkazildi.
            </p>
            <Link href="/nurse" className="mt-4 inline-flex min-h-12 items-center rounded-xl bg-teal-600 px-6 text-sm font-bold text-white hover:bg-teal-700">
              Vazifalarga qaytish
            </Link>
          </section>
        ) : (
          <Card title="Tashrifni tasdiqlash">
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Bemorga 6 xonali kod yuboriladi. Bemor uni oʻqib bersa, kodni kiriting — tashrif tasdiqlanadi.
              </p>

              <button
                type="button"
                onClick={() => void requestCode()}
                disabled={!workable || requesting || cooldownLeft > 0}
                className="min-h-12 w-full rounded-xl border border-teal-300 bg-teal-50 px-4 text-sm font-bold text-teal-800 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {requesting
                  ? "Yuborilmoqda..."
                  : cooldownLeft > 0
                    ? `Kodni qayta yuborish (${cooldownLeft} s)`
                    : codeActive
                      ? "Kodni qayta yuborish"
                      : "Bemorga kod yuborish"}
              </button>
              {!workable && <p className="text-xs text-amber-700">Avval vazifani qabul qiling.</p>}
              {otpInfo && (
                <p role="status" className="rounded-xl bg-green-50 px-3 py-2.5 text-sm text-green-700">
                  {otpInfo}
                </p>
              )}

              <label className="block text-sm font-medium text-gray-700">
                Tasdiqlash kodi
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  disabled={!codeActive || completing}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                    setOtpError(null);
                  }}
                  placeholder="••••••"
                  className={`${INPUT} mt-1.5 min-h-14 text-center font-mono text-2xl tracking-[0.5em] disabled:opacity-60`}
                />
              </label>
              {codeActive && attemptsLeft !== null && (
                <p className="text-xs text-gray-500">
                  Qolgan urinishlar: {attemptsLeft}
                  {otp.expiresAt && ` · Kod ${new Date(otp.expiresAt).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" })} gacha amal qiladi`}
                </p>
              )}
              {otpError && (
                <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  {otpError}
                </p>
              )}

              <button
                type="button"
                onClick={() => void complete()}
                disabled={completing || completeBlockReason !== null}
                className="min-h-14 w-full rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 px-4 text-base font-bold text-white shadow-md transition hover:from-emerald-700 hover:to-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {completing ? "Tekshirilmoqda..." : "Tashrifni tasdiqlash"}
              </button>
              {completeBlockReason && <p className="text-center text-xs text-gray-500">{completeBlockReason}</p>}
              {saveState === "error" && <p className="text-center text-xs text-red-600">Izoh va belgilar saqlanmadi — tasdiqlashda ular qayta yuboriladi.</p>}
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
