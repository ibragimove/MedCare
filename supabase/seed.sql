-- MedCare — seed.sql
-- Run AFTER schema.sql, in the Supabase SQL Editor.
-- Populates realistic Xorazm-region demo data so the dashboard isn't empty
-- for the jury: one pending, one green, one yellow, one red patient.

insert into nurses (full_name, tuman, village) values
  ('Gulnora Yusupova', 'Xazorasp', 'Xazorasp'),
  ('Dilnoza Matyoqubova', 'Bogʻot', 'Bogʻot'),
  ('Sardor Rajabov', 'Shovot', 'Shovot')
on conflict do nothing;

-- 1) Yangi bemor, hali nazorat oʻtkazilmagan (kulrang / "Kutilmoqda")
insert into patients (
  full_name, tuman, village, diagnosis, drug_name, dosage, expected_days,
  assigned_nurse_id, expected_trajectory, checkin_questions
) values (
  'Ahmadjon Karimov', 'Xazorasp', 'Xazorasp', 'Qandli diabet', 'Metformin', '500 mg, kuniga 2 mahal', 14,
  (select id from nurses where village = 'Xazorasp' limit 1),
  '1-3 kun: qon shakar darajasining asta-sekin pasayishi kuzatiladi. 4-7 kun: charchoq va chanqash kamayadi. 8-14 kun: koʻrsatkichlar barqarorlashadi.',
  '["Bugun dorini vaqtida ichdingizmi?", "Qon shakar darajasi meʼyorga yaqinmi?", "Ortiqcha chanqash yoki charchoq sezyapsizmi?"]'::jsonb
);

-- 2) Yaxshi holat (yashil, ~92%)
insert into patients (
  full_name, tuman, village, diagnosis, drug_name, dosage, expected_days,
  assigned_nurse_id, expected_trajectory, checkin_questions,
  last_match_percent, last_status
) values (
  'Malika Toshpulatova', 'Bogʻot', 'Bogʻot', 'Yurak yetishmovchiligi', 'Furosemid', '40 mg, kuniga 1 mahal', 10,
  (select id from nurses where village = 'Bogʻot' limit 1),
  '1-3 kun: shishlar kamayishi kutiladi. 4-7 kun: nafas qisishi yengillashadi. 8-10 kun: yurak urishi barqarorlashadi.',
  '["Bugun dorini vaqtida ichdingizmi?", "Oyoq yoki qorinda shish sezyapsizmi?", "Nafas qisishi kuchaydimi?"]'::jsonb,
  92, 'on_track'
);

insert into checkins (patient_id, answers, match_percent, ai_recommendation)
select id,
  '{"Bugun dorini vaqtida ichdingizmi?": true, "Oyoq yoki qorinda shish sezyapsizmi?": false, "Nafas qisishi kuchaydimi?": false}'::jsonb,
  92,
  'Holat yaxshi, kutilgan jarayonga mos. Yengil yurish mashqlari tavsiya etiladi, davolanishni xuddi shunday davom ettiring.'
from patients where full_name = 'Malika Toshpulatova';

-- 3) Kuzatuv talab etadi (sariq, ~78%)
insert into patients (
  full_name, tuman, village, diagnosis, drug_name, dosage, expected_days,
  assigned_nurse_id, expected_trajectory, checkin_questions,
  last_match_percent, last_status
) values (
  'Zilola Neʼmatova', 'Xazorasp', 'Xazorasp', 'Qandli diabet', 'Metformin', '850 mg, kuniga 2 mahal', 14,
  (select id from nurses where village = 'Xazorasp' limit 1),
  '1-3 kun: qon shakar darajasining asta-sekin pasayishi kuzatiladi. 4-7 kun: charchoq va chanqash kamayadi. 8-14 kun: koʻrsatkichlar barqarorlashadi.',
  '["Bugun dorini vaqtida ichdingizmi?", "Qon shakar darajasi meʼyorga yaqinmi?", "Ortiqcha chanqash yoki charchoq sezyapsizmi?"]'::jsonb,
  78, 'on_track'
);

insert into checkins (patient_id, answers, match_percent, ai_recommendation)
select id,
  '{"Bugun dorini vaqtida ichdingizmi?": true, "Qon shakar darajasi meʼyorga yaqinmi?": false, "Ortiqcha chanqash yoki charchoq sezyapsizmi?": true}'::jsonb,
  78,
  'Yengil chetlanish bor: chanqash va charchoq davom etmoqda. Suyuqlik va ovqatlanish tartibini kuzatib boring, ertaga qayta baholang.'
from patients where full_name = 'Zilola Neʼmatova';

-- 4) Jiddiy chetlanish (qizil, ~58%) — shifokorga xabarnoma bilan
insert into patients (
  full_name, tuman, village, diagnosis, drug_name, dosage, expected_days,
  assigned_nurse_id, expected_trajectory, checkin_questions,
  last_match_percent, last_status
) values (
  'Bahodir Ergashev', 'Shovot', 'Shovot', 'Gipertoniya', 'Amlodipin', '5 mg, kuniga 1 mahal', 12,
  (select id from nurses where village = 'Shovot' limit 1),
  '1-3 kun: qon bosimi asta-sekin pasayadi. 4-7 kun: bosh ogʻrigʻi va bosh aylanishi kamayadi. 8-12 kun: koʻrsatkichlar barqarorlashadi.',
  '["Bugun dorini vaqtida ichdingizmi?", "Bosh ogʻrigʻi yoki bosh aylanishi bormi?", "Qon bosimi meʼyorga yaqinmi?"]'::jsonb,
  58, 'deviation'
);

insert into checkins (patient_id, answers, match_percent, ai_recommendation)
select id,
  '{"Bugun dorini vaqtida ichdingizmi?": false, "Bosh ogʻrigʻi yoki bosh aylanishi bormi?": true, "Qon bosimi meʼyorga yaqinmi?": false}'::jsonb,
  58,
  'Jiddiy chetlanish: dori qabul qilinmagan va bosh ogʻrigʻi bor. Bemorni tezda tekshiruvdan oʻtkazish va dori qabulini nazorat qilish zarur.'
from patients where full_name = 'Bahodir Ergashev';

insert into alerts (patient_id, reason)
select id, 'Jiddiy chetlanish: dori qabul qilinmagan va bosh ogʻrigʻi bor. Bemorni tezda tekshiruvdan oʻtkazish va dori qabulini nazorat qilish zarur.'
from patients where full_name = 'Bahodir Ergashev';
