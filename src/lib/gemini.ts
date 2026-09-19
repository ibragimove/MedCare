import "server-only";
import {
  GoogleGenerativeAI,
  SchemaType,
  type Content,
  type EnhancedGenerateContentResponse,
  type GenerativeModel,
} from "@google/generative-ai";

const MODEL = "gemini-3.5-flash-lite";
const MAX_ATTEMPTS = 4;
const RETRY_DELAYS_MS = [500, 1500, 3000];

function getClient() {
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
}

function isRetryable(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return /\[(429|500|503)\b/.test(message) || /overloaded|high demand|unavailable/i.test(message);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Gemini occasionally returns transient 503/429s under load; retry a few
// times with backoff before surfacing an error to the demo UI.
async function generateWithRetry(model: GenerativeModel, prompt: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await model.generateContent(prompt);
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt === MAX_ATTEMPTS - 1) throw err;
      await sleep(RETRY_DELAYS_MS[attempt] ?? 3000);
    }
  }
  throw lastError;
}

export interface TrajectoryResult {
  trajectory: string;
  questions: string[];
}

export async function generateTrajectory(params: {
  diagnosis: string;
  drugName: string;
  dosage: string;
  expectedDays: number;
}): Promise<TrajectoryResult> {
  const model = getClient().getGenerativeModel({
    model: MODEL,
    systemInstruction:
      "Siz tibbiy AI yordamchisiz va statsionardan chiqarilgan bemorlarning uy sharoitidagi davolanish jarayonini kuzatishga yordam berasiz. " +
      "Bemorning tashxisi, dorisi, dozasi va kutilayotgan davolanish muddatiga asoslanib, kutilayotgan tuzalish jarayonining qisqa tavsifini va " +
      "hamshira har kuni bemordan (yoki uning qarindoshidan) soʻraydigan 3-4 ta oddiy ha/yoʻq nazorat savolini yarating. " +
      "Javobni FAQAT oʻzbek tilida (lotin yozuvida) yozing. Tibbiy jihatdan real va ehtiyotkor boʻling.",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          trajectory: {
            type: SchemaType.STRING,
            description: "Kutilayotgan tuzalish jarayonining qisqa tavsifi (2-4 jumla), oʻzbek tilida",
          },
          questions: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "3-4 ta kunlik ha/yoʻq nazorat savoli, oʻzbek tilida",
          },
        },
        required: ["trajectory", "questions"],
      },
    },
  });

  const result = await generateWithRetry(
    model,
    `Tashxis: ${params.diagnosis}\n` +
      `Dori: ${params.drugName}\n` +
      `Dozasi: ${params.dosage}\n` +
      `Kutilayotgan davolanish muddati: ${params.expectedDays} kun`,
  );

  return JSON.parse(result.response.text()) as TrajectoryResult;
}

export interface ScoreResult {
  matchPercent: number;
  status: "on_track" | "deviation";
  recommendation: string;
}

export async function scoreCheckin(params: {
  diagnosis: string;
  drugName: string;
  expectedDays: number;
  daysSinceDischarge: number;
  trajectory: string;
  questions: string[];
  answers: Record<string, boolean>;
}): Promise<ScoreResult> {
  const answersText = params.questions
    .map((q, i) => `${i + 1}. ${q} — ${params.answers[q] ? "Ha" : "Yoʻq"}`)
    .join("\n");

  const model = getClient().getGenerativeModel({
    model: MODEL,
    systemInstruction:
      "Siz tibbiy AI yordamchisiz. Bemorning kutilayotgan tuzalish jarayoni va hamshiraning kunlik nazorat javoblarini solishtirib, " +
      "bemorning holati kutilgan jarayonga necha foiz mos kelishini (0 dan 100 gacha) baholang. " +
      "90% va undan yuqori — yaxshi holat, 70-89% — kuzatuv talab etadi, 70% dan past — jiddiy chetlanish va shifokor eʼtiborini talab qiladi. " +
      "Qisqa va aniq tavsiya bering. Javobni FAQAT oʻzbek tilida (lotin yozuvida) yozing.",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          matchPercent: {
            type: SchemaType.INTEGER,
            description: "Kutilgan jarayonga moslik foizi, 0 dan 100 gacha",
          },
          status: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["on_track", "deviation"],
            description: "on_track agar matchPercent >= 70, aks holda deviation",
          },
          recommendation: {
            type: SchemaType.STRING,
            description: "Shifokor yoki hamshira uchun qisqa tavsiya, oʻzbek tilida",
          },
        },
        required: ["matchPercent", "status", "recommendation"],
      },
    },
  });

  const result = await generateWithRetry(
    model,
    `Tashxis: ${params.diagnosis}\n` +
      `Dori: ${params.drugName}\n` +
      `Kutilayotgan davolanish muddati: ${params.expectedDays} kun\n` +
      `Chiqarilganidan beri oʻtgan kunlar: ${params.daysSinceDischarge}\n` +
      `Kutilayotgan tuzalish jarayoni: ${params.trajectory}\n\n` +
      `Bugungi nazorat javoblari:\n${answersText}`,
  );

  return JSON.parse(result.response.text()) as ScoreResult;
}

export interface MedicationPlanItem {
  drug: string;
  dosage: string;
  times: string[];
  withFood: boolean;
  durationDays: number;
  instructions: string;
}

export interface MedicationPlanResult {
  items: MedicationPlanItem[];
  generalAdvice: string;
}

export async function generateMedicationPlan(params: {
  diagnosis: string;
  drugName: string;
  dosage: string;
  expectedDays: number;
}): Promise<MedicationPlanResult> {
  const model = getClient().getGenerativeModel({
    model: MODEL,
    systemInstruction:
      "Siz tibbiy AI yordamchisiz. Bemorning tashxisi, dorisi, dozasi va davolanish muddatiga asoslanib, " +
      "bemor uyda amal qiladigan aniq dori qabul qilish rejasini tuzing: kuniga necha mahal, aniq soatlarda " +
      "(masalan 08:00, 20:00), ovqat bilan birga ichish kerakmi, va qisqa yoʻriqnoma. Real va xavfsiz doza " +
      "chastotasidan foydalaning (odatda kuniga 1-4 mahal). Javobni FAQAT oʻzbek tilida (lotin yozuvida) yozing.",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          items: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                drug: { type: SchemaType.STRING },
                dosage: { type: SchemaType.STRING },
                times: {
                  type: SchemaType.ARRAY,
                  items: { type: SchemaType.STRING },
                  description: "Kunlik qabul vaqtlari, \"HH:MM\" formatida, 1-4 ta",
                },
                withFood: { type: SchemaType.BOOLEAN },
                durationDays: { type: SchemaType.INTEGER },
                instructions: { type: SchemaType.STRING, description: "Qisqa yoʻriqnoma, oʻzbek tilida" },
              },
              required: ["drug", "dosage", "times", "withFood", "durationDays", "instructions"],
            },
          },
          generalAdvice: {
            type: SchemaType.STRING,
            description: "Umumiy parvarish boʻyicha 1-2 jumlali maslahat, oʻzbek tilida",
          },
        },
        required: ["items", "generalAdvice"],
      },
    },
  });

  const result = await generateWithRetry(
    model,
    `Tashxis: ${params.diagnosis}\n` +
      `Dori: ${params.drugName}\n` +
      `Dozasi: ${params.dosage}\n` +
      `Davolanish muddati: ${params.expectedDays} kun`,
  );

  return JSON.parse(result.response.text()) as MedicationPlanResult;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// Gemini's chat API requires history to start with a user turn and to
// alternate roles, so merge consecutive same-role turns and drop a leading
// assistant greeting if one exists.
function toGeminiHistory(history: ChatTurn[]): Content[] {
  const result: Content[] = [];
  for (const turn of history) {
    const text = turn.content.trim();
    if (!text) continue;
    const role = turn.role === "user" ? "user" : "model";
    if (result.length === 0 && role === "model") continue;
    const last = result[result.length - 1];
    if (last && last.role === role) {
      last.parts.push({ text });
    } else {
      result.push({ role, parts: [{ text }] });
    }
  }
  // A trailing model turn would make the next user message follow a model
  // turn correctly, but a trailing user turn would break alternation.
  if (result.length && result[result.length - 1].role === "user") result.pop();
  return result;
}

async function* textChunks(stream: AsyncGenerator<EnhancedGenerateContentResponse>) {
  for await (const chunk of stream) {
    let text = "";
    try {
      text = chunk.text();
    } catch {
      // Safety-blocked or empty chunk — skip it rather than abort the stream.
      continue;
    }
    if (text) yield text;
  }
}

// Streams the assistant reply token-by-token (ChatGPT/Gemini style) using
// Gemini's native multi-turn chat, so the conversation stays continuous
// across messages instead of being re-stuffed into a single prompt.
export async function streamChatWithPatient(params: {
  diagnosis: string;
  drugName: string;
  dosage: string;
  trajectory: string;
  recentCheckins: { date: string; recommendation: string | null }[];
  history: ChatTurn[];
  message: string;
}): Promise<AsyncIterable<string>> {
  const checkinsText = params.recentCheckins.length
    ? params.recentCheckins.map((c) => `${c.date}: ${c.recommendation ?? "-"}`).join("\n")
    : "Hozircha nazorat maʼlumotlari yoʻq.";

  const model = getClient().getGenerativeModel({
    model: MODEL,
    systemInstruction:
      "Siz MedCare tibbiy yordamchisisiz — bemor bilan jonli, uzluksiz suhbat olib borasiz (xuddi ChatGPT yoki " +
      "Gemini kabi). Oldingi xabarlarni eslab qoling va suhbat mazmuniga tayanib javob bering. " +
      "ENG MUHIM QOIDA: bemorning har bir YANGI xabariga aynan shu xabarga xos, aniq va tabiiy javob bering — " +
      "avvalgi javoblaringizni takrorlamang, shablon matn ishlatmang. " +
      "Agar xabar tushunarsiz, juda qisqa, salomlashish yoki mavzuga aloqasi yoʻq boʻlsa, davolash rejasini " +
      "avtomatik qaytarmang — qisqa doʻstona javob bering va nima haqida yordam kerakligini soʻrang. " +
      "Faqat savolga bevosita aloqador maʼlumotni bering; dori nomi, dozasi va parhez haqida faqat savol aynan " +
      "shu haqida boʻlsagina batafsil tushuntiring. " +
      "Oddiy, iliq va tushunarli tilda yozing. Hech qachon dozani yoki dorini oʻzgartirmang yoki yangi dori " +
      "tavsiya qilmang — faqat mavjud davolash rejasi doirasida tushuntiring. Jiddiy holatda bemorni shifokor " +
      "yoki hamshira bilan bogʻlanishga yoʻnaltiring. Agar bemor xavfli alomatlar haqida yozsa (koʻkrak " +
      "ogʻrigʻi, nafas qisishi, hushidan ketish, qon ketish, juda yuqori qand/bosim), javobni \"Zudlik bilan " +
      "103 ga qoʻngʻiroq qiling va shifokoringizga xabar bering\" jumlasi bilan boshlang. " +
      "Javob odatda qisqa (150 soʻzgacha) boʻlsin, lekin bemor batafsil tushuntirish soʻrasa toʻliqroq yozing. " +
      "Markdown belgilaridan (yulduzcha, sarlavha #) foydalanmang; roʻyxat kerak boʻlsa oddiy chiziqcha (-) " +
      "ishlating. FAQAT oʻzbek tilida (lotin yozuvida) yozing.\n\n" +
      "BEMOR HAQIDA FON MAʼLUMOT (kerak boʻlganda foydalaning, har javobda takrorlamang):\n" +
      `Tashxis: ${params.diagnosis}\n` +
      `Dori: ${params.drugName} (${params.dosage})\n` +
      `Kutilayotgan tuzalish jarayoni: ${params.trajectory}\n` +
      `Soʻnggi hamshira nazoratlari:\n${checkinsText}`,
    generationConfig: {
      temperature: 1,
      topP: 0.95,
      maxOutputTokens: 800,
    },
  });

  const history = toGeminiHistory(params.history);

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      // Fresh chat per attempt so a failed call can't leave stale history.
      const chat = model.startChat({ history });
      const result = await chat.sendMessageStream(params.message);
      return textChunks(result.stream);
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt === MAX_ATTEMPTS - 1) throw err;
      await sleep(RETRY_DELAYS_MS[attempt] ?? 3000);
    }
  }
  throw lastError;
}

// ─────────────────────────────────────────────
// Epicrisis AI Pipeline
// ─────────────────────────────────────────────

export interface DeidentifyResult {
  deidentified: string;
}

// Strip PII (full names, PINFLs, phone numbers, addresses) from epicrisis text.
export async function deidentify(epicrisisRaw: string): Promise<DeidentifyResult> {
  const model = getClient().getGenerativeModel({
    model: MODEL,
    systemInstruction:
      "Siz tibbiy matn anonimlashtirish tizimisiz. Berilgan kasallik tarixi matnidan shaxsiy " +
      "maʼlumotlarni (ism, familiya, PINFL, telefon raqam, manzil, tug'ilgan sana) topib, " +
      "ularni [ANONIM] belgisi bilan almashtiring. Faqat anonimlashtiring — mazmunni oʻzgartirmang. " +
      "Javobni FAQAT JSON formatida yozing.",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: { deidentified: { type: SchemaType.STRING } },
        required: ["deidentified"],
      },
    },
  });
  const result = await generateWithRetry(model, epicrisisRaw);
  return JSON.parse(result.response.text()) as DeidentifyResult;
}

export interface EpicrisStructured {
  diagnosis: string;
  main_concerns: string[];
  home_care_tasks: string[];
  risk_score: number;
}

// Extract structured fields from de-identified epicrisis text.
export async function extractEpicrisStructured(deidentifiedText: string): Promise<EpicrisStructured> {
  const model = getClient().getGenerativeModel({
    model: MODEL,
    systemInstruction:
      "Siz tibbiy hujjat analizchisisiz. Berilgan anonimlashtrilgan kasallik tarixidan asosiy " +
      "tashxis, asosiy muammolar, uy parvarish vazifalari va 0-100 oraliq xavf ballini ajrating. " +
      "Xavf bali: 80+ = kritik, 50-79 = shoshilinch, 0-49 = oddiy. " +
      "Javob FAQAT oʻzbek tilida (lotin yozuvida), JSON formatida.",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          diagnosis: { type: SchemaType.STRING },
          main_concerns: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          home_care_tasks: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          risk_score: { type: SchemaType.INTEGER },
        },
        required: ["diagnosis", "main_concerns", "home_care_tasks", "risk_score"],
      },
    },
  });
  const result = await generateWithRetry(model, deidentifiedText);
  return JSON.parse(result.response.text()) as EpicrisStructured;
}

export interface BriefResult {
  brief_uz: string;
  checklist_uz: string[];
}

// Generate nurse-facing Uzbek brief and visit checklist.
export async function generateBrief(params: {
  diagnosis: string;
  mainConcerns: string[];
  homeCare: string[];
  riskScore: number;
}): Promise<BriefResult> {
  const model = getClient().getGenerativeModel({
    model: MODEL,
    systemInstruction:
      "Siz hamshira uchun qisqa yo'riqnoma tayyorlovchi tizimisiz. Berilgan ma'lumotlarga asosan " +
      "hamshira uchun oddiy, tushunarli tildagi qisqa xulosa (3-4 jumla) va 4-6 ta tashrif tekshiruv " +
      "ro'yxat bandini tayyorlang. FAQAT o'zbek tilida (lotin yozuvida), JSON formatida.",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          brief_uz: { type: SchemaType.STRING },
          checklist_uz: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        },
        required: ["brief_uz", "checklist_uz"],
      },
    },
  });
  const prompt =
    `Tashxis: ${params.diagnosis}\n` +
    `Asosiy muammolar: ${params.mainConcerns.join(", ")}\n` +
    `Uy parvarish vazifalari: ${params.homeCare.join(", ")}\n` +
    `Xavf bali: ${params.riskScore}/100`;
  const result = await generateWithRetry(model, prompt);
  return JSON.parse(result.response.text()) as BriefResult;
}
