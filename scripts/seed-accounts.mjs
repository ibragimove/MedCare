// Creates/updates the demo accounts (doctor + nurse + patient) for the hackathon demo,
// links the patient account to an existing care episode, adds one completed past episode,
// and backfills medication_plan for active episodes that don't have one yet.
// Run with: node --env-file=.env.local scripts/seed-accounts.mjs
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiKey = process.env.GEMINI_API_KEY;

if (!url || !serviceKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL va SUPABASE_SERVICE_ROLE_KEY .env.local da boʻlishi kerak");
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function upsertAccount({ email, password, role, fullName, village, phone, nurseFullName }) {
  const { data: list, error: listError } = await admin.auth.admin.listUsers();
  if (listError) throw listError;
  let user = list.users.find((u) => u.email === email);

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role, full_name: fullName },
    });
    if (error) throw error;
    user = data.user;
    console.log(`Created auth user: ${email}`);
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      user_metadata: { role, full_name: fullName },
    });
    if (error) throw error;
    console.log(`Auth user already existed, refreshed: ${email}`);
  }

  let nurseId = null;
  if (nurseFullName) {
    const { data: nurse } = await admin.from("nurses").select("id").eq("full_name", nurseFullName).maybeSingle();
    nurseId = nurse?.id ?? null;
    if (!nurseId) {
      console.warn(`Warning: nurse row "${nurseFullName}" not found — nurse_id left null`);
    }
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: user.id,
    role,
    full_name: fullName,
    village: village ?? null,
    nurse_id: nurseId,
    phone: phone ?? null,
  });
  if (profileError) throw profileError;
  console.log(`Profile ready: ${email} (${role})`);
  return user;
}

async function generateMedicationPlan({ diagnosis, drugName, dosage, expectedDays }) {
  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-3.5-flash-lite",
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
                times: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                withFood: { type: SchemaType.BOOLEAN },
                durationDays: { type: SchemaType.INTEGER },
                instructions: { type: SchemaType.STRING },
              },
              required: ["drug", "dosage", "times", "withFood", "durationDays", "instructions"],
            },
          },
          generalAdvice: { type: SchemaType.STRING },
        },
        required: ["items", "generalAdvice"],
      },
    },
  });

  const result = await model.generateContent(
    `Tashxis: ${diagnosis}\nDori: ${drugName}\nDozasi: ${dosage}\nDavolanish muddati: ${expectedDays} kun`,
  );
  return JSON.parse(result.response.text());
}

// --- Accounts ---

await upsertAccount({
  email: "shifokor@demo.uz",
  password: "Demo1234!",
  role: "doctor",
  fullName: "Dr. Alisher Yusupov",
  phone: "+998901112233",
});

await upsertAccount({
  email: "hamshira@demo.uz",
  password: "Demo1234!",
  role: "nurse",
  fullName: "Gulnora Yusupova",
  village: "Xazorasp",
  nurseFullName: "Gulnora Yusupova",
});

const patientUser = await upsertAccount({
  email: "bemor@demo.uz",
  password: "Demo1234!",
  role: "patient",
  fullName: "Ahmadjon Karimov",
  phone: "+998901234567",
});

// --- Link the existing active episode to the patient account ---

const { data: activePatient } = await admin
  .from("patients")
  .select("id")
  .eq("full_name", "Ahmadjon Karimov")
  .is("completed_at", null)
  .limit(1)
  .maybeSingle();

if (activePatient) {
  await admin.from("patients").update({ profile_id: patientUser.id }).eq("id", activePatient.id);
  console.log(`Linked active episode ${activePatient.id} to patient account`);
} else {
  console.warn('Warning: no active "Ahmadjon Karimov" episode found to link');
}

// --- Add one completed past episode so "Tugallangan davolanishlar" isn't empty ---

const { data: existingCompleted } = await admin
  .from("patients")
  .select("id")
  .eq("profile_id", patientUser.id)
  .not("completed_at", "is", null)
  .limit(1)
  .maybeSingle();

if (!existingCompleted) {
  const dischargeDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  const completedAt = new Date(Date.now() - 33 * 24 * 60 * 60 * 1000);

  const { data: nurse } = await admin.from("nurses").select("id").eq("full_name", "Gulnora Yusupova").maybeSingle();

  const { data: pastEpisode, error: pastError } = await admin
    .from("patients")
    .insert({
      full_name: "Ahmadjon Karimov",
      tuman: "Xazorasp",
      village: "Xazorasp",
      diagnosis: "Oʻtkir bronxit",
      drug_name: "Amoksitsillin",
      dosage: "500 mg, kuniga 3 mahal",
      expected_days: 7,
      discharge_date: dischargeDate.toISOString().slice(0, 10),
      completed_at: completedAt.toISOString(),
      assigned_nurse_id: nurse?.id ?? null,
      profile_id: patientUser.id,
      last_match_percent: 94,
      last_status: "on_track",
      expected_trajectory: "1-3 kun: yoʻtal va isitma kamayadi. 4-7 kun: nafas olish toʻliq yengillashadi.",
    })
    .select("id")
    .single();

  if (pastError) throw pastError;

  await admin.from("checkins").insert({
    patient_id: pastEpisode.id,
    answers: { "Isitma bormi?": false, "Yoʻtal kamaydimi?": true },
    match_percent: 94,
    ai_recommendation: "Davolanish muvaffaqiyatli yakunlandi, alomatlar toʻliq yoʻqoldi.",
  });

  console.log(`Created completed past episode ${pastEpisode.id}`);
} else {
  console.log("Completed past episode already exists — skipped");
}

// --- Backfill medication_plan for active episodes missing one ---

if (geminiKey) {
  const { data: missingPlan } = await admin
    .from("patients")
    .select("id, diagnosis, drug_name, dosage, expected_days")
    .is("completed_at", null)
    .is("medication_plan", null);

  for (const p of missingPlan ?? []) {
    try {
      const plan = await generateMedicationPlan({
        diagnosis: p.diagnosis,
        drugName: p.drug_name,
        dosage: p.dosage,
        expectedDays: p.expected_days,
      });
      await admin.from("patients").update({ medication_plan: plan }).eq("id", p.id);
      console.log(`Medication plan generated for ${p.id} (${p.diagnosis})`);
    } catch (err) {
      console.warn(`Medication plan failed for ${p.id}:`, err.message ?? err);
    }
  }
} else {
  console.warn("GEMINI_API_KEY not set — skipping medication_plan backfill");
}

console.log("Seed complete.");
