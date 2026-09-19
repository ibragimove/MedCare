-- MedCare — migration_008_polish.sql
-- Run once in the Supabase SQL Editor (Project → SQL Editor → New query → paste → Run).
-- Idempotent: safe to run again. The app keeps working (with clear Uzbek errors) if it has
-- not been run yet, but the new features below need it.
--
--   1. territories   — full tuman → mahalla list for Xorazm (seeded from official lex.uz decisions)
--   2. nurses        — phone / email / is_active columns
--   3. nurse_territories — a nurse serves one tuman and many mahallas
--   4. nurse id unification — nurses.id = auth.users.id = profiles.id = profiles.nurse_id
--   5. patients      — phone, address, territory_id backfill
--   6. patient_medications — several medications per patient
--   7. patient_otps.otp_enc — reversible copy so the patient can read the code in the portal
--   8. care_tasks.checklist_done — the nurse's ticked visit checklist survives a reload

-- ─────────────────────────────────────────────
-- 1. Territories (tuman → mahalla)
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS territories_tuman_idx ON territories (tuman);

-- Source: official district council decisions on lex.uz (2014–2016 annexes listing every
-- "… m.f.y."). New names from a renaming row are used. The list can be out of date or
-- incomplete for some districts — complete it in Menejer → Hududlar (add / rename / delete).
-- Xonqa and Tuproqqalʼa have no published annex in the sources used; add their mahallas there.
INSERT INTO territories (tuman, village) VALUES
  ('Bogʻot', 'Abu Rayhon Beruniy nomidagi'),
  ('Bogʻot', 'Oqtepa'),
  ('Bogʻot', 'Hurriyat'),
  ('Bogʻot', 'Qorabogʻ'),
  ('Bogʻot', 'Oʻzgarish'),
  ('Bogʻot', 'Mehnatguli'),
  ('Bogʻot', 'Yosh oʻsmir'),
  ('Bogʻot', 'Mesitboʻyi'),
  ('Bogʻot', 'Qumbodoq'),
  ('Bogʻot', 'Koʻnabirlashuv'),
  ('Bogʻot', 'Qashqalar'),
  ('Bogʻot', 'Qushlilar'),
  ('Bogʻot', 'Mesit'),
  ('Bogʻot', 'Esamat'),
  ('Bogʻot', 'Ashxobod'),
  ('Bogʻot', 'Nukus'),
  ('Bogʻot', 'Bejganak'),
  ('Bogʻot', 'Obod'),
  ('Bogʻot', 'Nurafshon'),
  ('Bogʻot', 'Oltinqum'),
  ('Bogʻot', 'Madaniyat'),
  ('Bogʻot', 'Gʻalaba'),
  ('Bogʻot', 'Oq oltin'),
  ('Bogʻot', 'Yangi qadam'),
  ('Bogʻot', 'Naymanboʻyi'),
  ('Bogʻot', 'Mayda millat'),
  ('Bogʻot', 'Boʻka'),
  ('Bogʻot', 'Zarbdor'),
  ('Bogʻot', 'Beshariq'),
  ('Bogʻot', 'Qipchoq'),
  ('Bogʻot', 'Yumaloq toʻgʻoy'),
  ('Bogʻot', 'Eshonlar'),
  ('Bogʻot', 'Ogʻalar'),
  ('Bogʻot', 'Ustalar'),
  ('Bogʻot', 'Boʻsaloq'),
  ('Bogʻot', 'Miroblar'),
  ('Bogʻot', 'Qoʻngʻirot'),
  ('Bogʻot', 'Tozabozor'),
  ('Bogʻot', 'Guduklar'),
  ('Bogʻot', 'Olchinsolma'),
  ('Bogʻot', 'Qoʻldov'),
  ('Bogʻot', 'Qipchoqlar'),
  ('Bogʻot', 'Qirmalar'),
  ('Bogʻot', 'Oʻzbekiston'),
  ('Bogʻot', 'Boʻkalar'),
  ('Bogʻot', 'Bogʻiston'),
  ('Bogʻot', 'Oʻrtabodoq'),
  ('Bogʻot', 'Osyop'),
  ('Gurlan', 'Yangi bogʻ'),
  ('Gurlan', 'Ishonch'),
  ('Gurlan', 'Maʼrifat'),
  ('Gurlan', 'Navbahor'),
  ('Gurlan', 'Bogʻishamol'),
  ('Gurlan', 'Yangi asr'),
  ('Gurlan', 'Nurobod'),
  ('Gurlan', 'Madadkor'),
  ('Gurlan', 'Gulshan'),
  ('Gurlan', 'Bogʻiston'),
  ('Gurlan', 'Shodlik'),
  ('Gurlan', 'Fidokor'),
  ('Gurlan', 'Saxtiyon'),
  ('Gurlan', 'Obod'),
  ('Gurlan', 'Vatanparvar'),
  ('Gurlan', 'Chakkalar'),
  ('Gurlan', 'Jaloyir'),
  ('Gurlan', 'Sovunchi'),
  ('Gurlan', 'Paxtachi'),
  ('Gurlan', 'Tozayorgan'),
  ('Gurlan', 'Eshimjiron'),
  ('Gurlan', 'Qatariq'),
  ('Gurlan', 'Moyli'),
  ('Gurlan', 'Yormish'),
  ('Gurlan', 'Boldoqli'),
  ('Gurlan', 'Boʻzqalʼa'),
  ('Gurlan', 'Dehqonobod'),
  ('Gurlan', 'Esabiy'),
  ('Gurlan', 'Doʻstlik bogʻi'),
  ('Gurlan', 'Kangli'),
  ('Gurlan', 'Oqqum'),
  ('Gurlan', 'Olchin'),
  ('Gurlan', 'Mevazor'),
  ('Gurlan', 'Nurafshon'),
  ('Gurlan', 'Ziyokor'),
  ('Gurlan', 'Navbiryop'),
  ('Gurlan', 'Dehqon'),
  ('Gurlan', 'Doʻsimbiy'),
  ('Gurlan', 'Taxtakoʻpir'),
  ('Gurlan', 'Marbugʻat'),
  ('Gurlan', 'Nurli yoʻl'),
  ('Gurlan', 'Paxtakor'),
  ('Gurlan', 'Birlashgan'),
  ('Gurlan', 'Nukus'),
  ('Gurlan', 'Shangʻi'),
  ('Gurlan', 'Doʻstlik'),
  ('Gurlan', 'Navroʻz'),
  ('Gurlan', 'Oʻyilma'),
  ('Gurlan', 'Beshuy'),
  ('Gurlan', 'Chinobod'),
  ('Gurlan', 'Avaz Oʻtar nomidagi'),
  ('Gurlan', 'Joʻshqin'),
  ('Gurlan', 'Maxtumquli nomidagi'),
  ('Xazorasp', 'Yangibozor'),
  ('Xazorasp', 'Aloqalikoʻl'),
  ('Xazorasp', 'Amudaryo'),
  ('Xazorasp', 'Karvak'),
  ('Xazorasp', 'Gʻofur Gʻulom nomidagi'),
  ('Xazorasp', 'Shovot'),
  ('Xazorasp', 'Yangiobod'),
  ('Xazorasp', 'Ovshar'),
  ('Xazorasp', 'Jangiota'),
  ('Xazorasp', 'Istiqlol'),
  ('Xazorasp', 'Muxomon'),
  ('Xazorasp', 'Yangi hayot'),
  ('Xazorasp', 'Navroʻz'),
  ('Xazorasp', 'Shexyop-Mutpiri'),
  ('Xazorasp', 'Beshta'),
  ('Xazorasp', 'Toʻrta'),
  ('Xazorasp', 'Boʻston'),
  ('Xazorasp', 'Qovunchi'),
  ('Xazorasp', 'Sanoat'),
  ('Xazorasp', 'Otaliq'),
  ('Xazorasp', 'Bogʻdor'),
  ('Xazorasp', 'Mustaqillik'),
  ('Xazorasp', 'Pichoqchi'),
  ('Xazorasp', 'Ibrat'),
  ('Xazorasp', '12 narvon'),
  ('Xazorasp', 'Juvondir'),
  ('Xazorasp', 'Uzukkaqosh'),
  ('Xazorasp', 'Ishchilar'),
  ('Xazorasp', 'Al-Xorazmiy nomidagi'),
  ('Xazorasp', 'Oybek nomidagi'),
  ('Xazorasp', 'Sharof Rashidov nomidagi'),
  ('Xazorasp', 'Sulaymon qalʼa'),
  ('Xazorasp', 'Yorqin hayot'),
  ('Xazorasp', 'Pastom'),
  ('Xazorasp', 'Sayopir'),
  ('Xazorasp', 'Saidlar'),
  ('Xazorasp', 'Shixlar'),
  ('Xazorasp', 'Obod'),
  ('Xazorasp', 'Sharlauq'),
  ('Xazorasp', 'Yoshlik'),
  ('Xazorasp', 'Navbahor'),
  ('Xazorasp', 'Ravnaq'),
  ('Xazorasp', 'Muhabbat'),
  ('Xazorasp', 'Hazorasp'),
  ('Xazorasp', 'Xiva'),
  ('Xazorasp', 'Xonqa'),
  ('Xazorasp', 'Nukus'),
  ('Xazorasp', 'Sarimoy'),
  ('Xiva', 'Qumyaska'),
  ('Xiva', 'Kaptarxona'),
  ('Xiva', 'Mevaston'),
  ('Xiva', 'Ichon Qalʼa'),
  ('Xiva', 'Kalta minor'),
  ('Xiva', 'Sangar'),
  ('Xiva', 'Lolazor'),
  ('Xiva', 'Yangi turmush'),
  ('Xiva', 'Yangi hayot'),
  ('Xiva', 'Tozabogʻ'),
  ('Xiva', 'Guliston'),
  ('Xiva', 'Gulirayhon'),
  ('Xiva', 'Doʻstlik'),
  ('Xiva', 'Binokor'),
  ('Xiva', 'Gazchi'),
  ('Xiva', 'Gilamchi'),
  ('Xiva', 'Xorvuz'),
  ('Xiva', 'Yuqori Xorvuz'),
  ('Xiva', 'Oʻrta Xorvuz'),
  ('Xiva', 'Koʻlli'),
  ('Xiva', 'Istiqlol'),
  ('Xiva', 'Shomoxulum'),
  ('Xiva', 'Parchanxos'),
  ('Xiva', 'Qoradomoq'),
  ('Xiva', 'Chanashik'),
  ('Xiva', 'Varagʻzon'),
  ('Xiva', 'Koʻshchi Kattabogʻ'),
  ('Xiva', 'Avaz dunak nomidagi'),
  ('Xiva', 'Pano Maxsim nomidagi'),
  ('Xiva', 'Qiyot'),
  ('Xiva', 'Gulshan'),
  ('Xiva', 'Qoraqum'),
  ('Xiva', 'Boʻston'),
  ('Xiva', 'Dashyoq'),
  ('Xiva', 'Oq yop'),
  ('Xiva', 'Qibla Tozabogʻ'),
  ('Xiva', 'Shixlar'),
  ('Xiva', 'Serchalli'),
  ('Xiva', 'Gandimyon'),
  ('Xiva', 'Angarik'),
  ('Xiva', 'Polosulton nomidagi'),
  ('Xiva', 'Pirnaxos'),
  ('Xiva', 'Pishkanik'),
  ('Xiva', 'Al Xorazmiy nomidagi'),
  ('Xiva', 'Soyot'),
  ('Xiva', 'Oq koʻl'),
  ('Xiva', 'Chinobod'),
  ('Xiva', 'Shoʻr koʻl'),
  ('Xiva', 'Qatti bosh'),
  ('Xiva', 'Juryon'),
  ('Xiva', 'Arvik'),
  ('Xiva', 'Indavak'),
  ('Xonqa', 'Xonqa shaharchasi'),
  ('Qoʻshkoʻpir', 'Gulzor'),
  ('Qoʻshkoʻpir', 'Madaniyat'),
  ('Qoʻshkoʻpir', 'Taraqqiyot'),
  ('Qoʻshkoʻpir', 'Iqbol'),
  ('Qoʻshkoʻpir', 'Bahoriston'),
  ('Qoʻshkoʻpir', 'Chamanzor'),
  ('Qoʻshkoʻpir', 'Qoramon'),
  ('Qoʻshkoʻpir', 'Shixmashhad'),
  ('Qoʻshkoʻpir', 'Oʻzbekiston'),
  ('Qoʻshkoʻpir', 'Zarbdor'),
  ('Qoʻshkoʻpir', 'Sherobod'),
  ('Qoʻshkoʻpir', 'Yangilik'),
  ('Qoʻshkoʻpir', 'Yovgʻur'),
  ('Qoʻshkoʻpir', 'Mesit'),
  ('Qoʻshkoʻpir', 'Ayronkoʻl'),
  ('Qoʻshkoʻpir', 'Amirqum'),
  ('Qoʻshkoʻpir', 'Burloq'),
  ('Qoʻshkoʻpir', 'Vahimchi'),
  ('Qoʻshkoʻpir', 'Mehnatobod'),
  ('Qoʻshkoʻpir', 'Ilgaldi'),
  ('Qoʻshkoʻpir', 'Bekobod'),
  ('Qoʻshkoʻpir', 'Changli-1'),
  ('Qoʻshkoʻpir', 'Changli-2'),
  ('Qoʻshkoʻpir', 'Doʻstlik'),
  ('Qoʻshkoʻpir', 'Yoshlik'),
  ('Qoʻshkoʻpir', 'Bogʻzor'),
  ('Qoʻshkoʻpir', 'Barkamollik'),
  ('Qoʻshkoʻpir', 'Darband'),
  ('Qoʻshkoʻpir', 'Ittifoq'),
  ('Qoʻshkoʻpir', 'Tafakkur'),
  ('Qoʻshkoʻpir', 'Tong yulduzi'),
  ('Qoʻshkoʻpir', 'Adolat'),
  ('Qoʻshkoʻpir', 'Iftixor'),
  ('Qoʻshkoʻpir', 'Alpomish'),
  ('Qoʻshkoʻpir', 'Tojmahal'),
  ('Qoʻshkoʻpir', 'Xosiyon'),
  ('Qoʻshkoʻpir', 'Tagalak'),
  ('Qoʻshkoʻpir', 'Xayrobod'),
  ('Qoʻshkoʻpir', 'Koʻnazey'),
  ('Qoʻshkoʻpir', 'Yuksalish'),
  ('Qoʻshkoʻpir', 'Qadriyat'),
  ('Qoʻshkoʻpir', 'Oltin voha'),
  ('Qoʻshkoʻpir', 'Durdona'),
  ('Qoʻshkoʻpir', 'Tabarruk'),
  ('Qoʻshkoʻpir', 'Nezaxos'),
  ('Qoʻshkoʻpir', 'Polvon'),
  ('Qoʻshkoʻpir', 'Kenagas'),
  ('Qoʻshkoʻpir', 'Dovud'),
  ('Qoʻshkoʻpir', 'Arablar'),
  ('Qoʻshkoʻpir', 'Baratlar'),
  ('Shovot', 'Shovot'),
  ('Shovot', 'Doʻstlik'),
  ('Shovot', 'Istiqlol'),
  ('Shovot', 'Paxtakor'),
  ('Shovot', 'Yangiobod'),
  ('Shovot', 'Bunyodkor'),
  ('Shovot', 'Zamondosh'),
  ('Shovot', 'Turkiston'),
  ('Shovot', 'Qum yop'),
  ('Shovot', 'Asavey'),
  ('Shovot', 'Oq oltin'),
  ('Shovot', 'Arbob'),
  ('Shovot', 'Boʻz qalʼa'),
  ('Shovot', 'Ipakchi'),
  ('Shovot', 'Qozoqqalʼa'),
  ('Shovot', 'Uzunkoʻl'),
  ('Shovot', 'Xitoy'),
  ('Shovot', 'Taraqqiyot'),
  ('Shovot', 'Boʻyrachi'),
  ('Shovot', 'Oq-koʻl'),
  ('Shovot', 'Ostona'),
  ('Shovot', 'Yangi turmish'),
  ('Shovot', 'Oltinqalʼa'),
  ('Shovot', 'Tuproqqalʼa'),
  ('Shovot', 'Botirlar'),
  ('Shovot', 'Hunarmandlar'),
  ('Shovot', 'Qiyot'),
  ('Shovot', 'Oydin'),
  ('Shovot', 'Qunduz'),
  ('Shovot', 'Idaliqalʼa'),
  ('Shovot', 'Komiljon ota'),
  ('Shovot', 'Royat'),
  ('Shovot', 'Mevazor'),
  ('Shovot', 'Mexnatobod'),
  ('Shovot', 'Guliston'),
  ('Shovot', 'Boʻston'),
  ('Shovot', 'Ogohiy'),
  ('Shovot', 'Avaz Oʻtar'),
  ('Shovot', 'Ijtiomiyat'),
  ('Shovot', 'Ziyo'),
  ('Shovot', 'Beshchiqir'),
  ('Shovot', 'Yangi burloq'),
  ('Shovot', 'Gulshan'),
  ('Shovot', 'Qoʻshkoʻpir'),
  ('Shovot', 'Beshmergan'),
  ('Shovot', 'Yangiyoʻl'),
  ('Shovot', 'Eshonqalʼa'),
  ('Shovot', 'Arbek'),
  ('Shovot', 'Lochin'),
  ('Shovot', 'Mahtumquli'),
  ('Urganch', 'Miroblar'),
  ('Urganch', 'Matnazar Oxun nomidagi'),
  ('Urganch', 'Jayxun'),
  ('Urganch', 'Anjirchi'),
  ('Urganch', 'Yormishyop'),
  ('Urganch', 'Uygʻur'),
  ('Urganch', 'Uyshin'),
  ('Urganch', 'Yaxshi niyat'),
  ('Urganch', 'Arablar'),
  ('Urganch', 'Amudaryo'),
  ('Urganch', 'Killavut'),
  ('Urganch', 'Qaychili'),
  ('Urganch', 'Tajriba stansiyasi'),
  ('Urganch', 'Chandir'),
  ('Urganch', 'Chandiryop boʻyi'),
  ('Urganch', 'Boqaylar'),
  ('Urganch', 'Qiyot'),
  ('Urganch', 'Uchkoʻprik'),
  ('Urganch', 'Beshayvon'),
  ('Urganch', 'Sarichilar'),
  ('Urganch', 'Shermatlar'),
  ('Urganch', 'Oq ari'),
  ('Urganch', 'Oʻrislar'),
  ('Urganch', 'Sholikorlar'),
  ('Urganch', 'Chakkakoʻli'),
  ('Urganch', 'Qushchilar'),
  ('Urganch', 'Oʻrtadoʻrman'),
  ('Urganch', 'Oltinkoʻl'),
  ('Urganch', 'Mevazor'),
  ('Urganch', 'Yoshlik'),
  ('Urganch', 'Boʻston'),
  ('Urganch', 'Alisher Navoiy nomidagi'),
  ('Urganch', 'Shodlik'),
  ('Urganch', 'Azizlar'),
  ('Urganch', 'Arboblar'),
  ('Urganch', 'Oq oltin'),
  ('Urganch', 'Bogʻdorchi'),
  ('Urganch', 'Hamid Olimjon nomidagi'),
  ('Urganch', 'Kipchoq'),
  ('Urganch', 'Qipchoq'),
  ('Urganch', 'Bobodehqon'),
  ('Urganch', 'Oʻrta bogʻ'),
  ('Urganch', 'Oʻrtabogʻ'),
  ('Urganch', 'Kattabogʻ'),
  ('Urganch', 'Yuqorijirmiz'),
  ('Urganch', 'Ustalar'),
  ('Urganch', 'Xasaul'),
  ('Urganch', 'Abu Rayxon Beruniy nomidagi'),
  ('Urganch', 'Qoramon'),
  ('Urganch', 'Tandirchi'),
  ('Urganch', 'Bogʻiston'),
  ('Urganch', 'Oyoqbogʻ'),
  ('Urganch', 'Adolat'),
  ('Urganch', 'Oq maktab'),
  ('Urganch', 'Shoxidonlar'),
  ('Urganch', 'Xojiboylar'),
  ('Urganch', 'Olauylik'),
  ('Urganch', 'Turkmanlar'),
  ('Urganch', 'Choʻlobod'),
  ('Urganch', 'Qumrovot'),
  ('Urganch', 'Navroʻz'),
  ('Urganch', 'Obod'),
  ('Urganch', 'Gʻalaba'),
  ('Urganch', 'Hayvat'),
  ('Urganch', 'Baxshilar'),
  ('Urganch', 'Hilol'),
  ('Urganch', 'Gulobod'),
  ('Urganch', 'Hidoyat'),
  ('Urganch', 'Orzu'),
  ('Urganch', 'Toshkoʻpir'),
  ('Urganch', 'Oqyop'),
  ('Urganch', 'Qoʻngʻirot'),
  ('Urganch', 'Rovot'),
  ('Urganch', 'Zargarlar'),
  ('Urganch', 'Qorayontoq'),
  ('Urganch', 'Doʻstlik'),
  ('Urganch', 'Munis Xorazmiy nomidagi'),
  ('Urganch', 'Jambul nomidagi'),
  ('Urganch', 'Komiljon Otaniyozov nomidagi'),
  ('Urganch', 'Amangaldi nomidagi'),
  ('Urganch', 'Oltinsarin'),
  ('Urganch', 'Ibn Sino nomidagi'),
  ('Urganch', 'Koʻnaovul'),
  ('Yangiariq', 'Ogahiy nomidagi'),
  ('Yangiariq', 'Yangiobod'),
  ('Yangiariq', 'Yangiariq'),
  ('Yangiariq', 'Oʻzbekiston'),
  ('Yangiariq', 'Boʻston'),
  ('Yangiariq', 'Arboblar'),
  ('Yangiariq', 'Tagan'),
  ('Yangiariq', 'Qoʻriqtom'),
  ('Yangiariq', 'Shirsholi'),
  ('Yangiariq', 'Poʻrsang'),
  ('Yangiariq', 'Yangiyer'),
  ('Yangiariq', 'Sevgan'),
  ('Yangiariq', 'Vakillar'),
  ('Yangiariq', 'Gullanbogʻ'),
  ('Yangiariq', 'Qarmish'),
  ('Yangiariq', 'Shixbogʻi'),
  ('Yangiariq', 'Sherobod'),
  ('Yangiariq', 'Jaloil'),
  ('Yangiariq', 'Kattabogʻ'),
  ('Yangiariq', 'Gʻaltak'),
  ('Yangiariq', 'Egrisolma'),
  ('Yangiariq', 'Baliqchi'),
  ('Yangiariq', 'Qoʻshloq'),
  ('Yangiariq', 'Xoʻjalar'),
  ('Yangiariq', 'Chaqir'),
  ('Yangiariq', 'Oqmachit'),
  ('Yangiariq', 'Angariq'),
  ('Yangiariq', 'Soburzon'),
  ('Yangiariq', 'Achchiqquyi'),
  ('Yangibozor', 'Doʻstlik'),
  ('Yangibozor', 'Navroʻz'),
  ('Yangibozor', 'Yangiyop'),
  ('Yangibozor', 'Istiqlol'),
  ('Yangibozor', 'Iftixor'),
  ('Yangibozor', 'Xayvat'),
  ('Yangibozor', 'Hamid Olimjon'),
  ('Yangibozor', 'Barxayot'),
  ('Yangibozor', 'Shoirlar'),
  ('Yangibozor', 'Mangʻitlar'),
  ('Yangibozor', 'Navr yop'),
  ('Yangibozor', 'Boʻston'),
  ('Yangibozor', 'Yuqoriboshqir'),
  ('Yangibozor', 'Jayxun'),
  ('Yangibozor', 'Navbaxor'),
  ('Yangibozor', 'Ocha-qalʼa'),
  ('Yangibozor', 'Shirinlar'),
  ('Yangibozor', 'Guliston'),
  ('Yangibozor', 'Kadriyat'),
  ('Yangibozor', 'Oltinkoʻl'),
  ('Yangibozor', 'Choʻbolonchi'),
  ('Yangibozor', 'Mingbogʻolon'),
  ('Yangibozor', 'Qiyot'),
  ('Yangibozor', 'Bogʻolon'),
  ('Yangibozor', 'Katli'),
  ('Yangibozor', 'Tozadoʻrman'),
  ('Yangibozor', 'Xalqobod'),
  ('Yangibozor', 'Shijoat'),
  ('Yangibozor', 'Qoratepa'),
  ('Yangibozor', 'Oʻyrat')
ON CONFLICT (tuman, village) DO NOTHING;

-- Two demo rows from migration 006 put a mahalla under the wrong tuman (Shovot and
-- Yangibozor are tumans of their own). Remove them unless a patient already points at them.
DELETE FROM territories t
 WHERE ((t.tuman = 'Xiva' AND t.village = 'Shovot') OR (t.tuman = 'Urganch' AND t.village = 'Yangibozor'))
   AND NOT EXISTS (SELECT 1 FROM patients p WHERE p.territory_id = t.id);

-- ─────────────────────────────────────────────
-- 2. Nurses: contact + activation flag
-- ─────────────────────────────────────────────
ALTER TABLE nurses
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- ─────────────────────────────────────────────
-- 3. Nurse ↔ territory (many mahallas per nurse)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nurse_territories (
  nurse_id      uuid NOT NULL REFERENCES nurses (id) ON DELETE CASCADE,
  territory_id  uuid NOT NULL REFERENCES territories (id) ON DELETE CASCADE,
  PRIMARY KEY (nurse_id, territory_id)
);
CREATE INDEX IF NOT EXISTS nurse_territories_territory_idx ON nurse_territories (territory_id);
ALTER TABLE nurse_territories DISABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────
-- 4. Normalise tuman spelling (apostrophes, Hazorasp → Xazorasp)
-- ─────────────────────────────────────────────
UPDATE nurses
   SET tuman = CASE WHEN lower(tuman) LIKE 'hazorasp%' THEN 'Xazorasp'
                    ELSE replace(replace(tuman, '''', 'ʻ'), '’', 'ʻ') END
 WHERE tuman ~ '[''’]' OR lower(tuman) LIKE 'hazorasp%';

UPDATE patients
   SET tuman = CASE WHEN lower(tuman) LIKE 'hazorasp%' THEN 'Xazorasp'
                    ELSE replace(replace(tuman, '''', 'ʻ'), '’', 'ʻ') END
 WHERE tuman ~ '[''’]' OR lower(tuman) LIKE 'hazorasp%';

-- ─────────────────────────────────────────────
-- 5. Nurse id unification: nurses.id = profiles.id = auth user id
--    (care_tasks / visits / SLA code already treat the nurse id as the profile id)
-- ─────────────────────────────────────────────
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT id, nurse_id FROM profiles
     WHERE role = 'nurse' AND nurse_id IS NOT NULL AND nurse_id <> id
  LOOP
    IF EXISTS (SELECT 1 FROM nurses WHERE id = p.nurse_id) THEN
      IF NOT EXISTS (SELECT 1 FROM nurses WHERE id = p.id) THEN
        INSERT INTO nurses (id, full_name, village, tuman, phone, email, is_active, created_at)
        SELECT p.id, full_name, village, tuman, phone, email, is_active, created_at
          FROM nurses WHERE id = p.nurse_id;
      END IF;

      UPDATE patients   SET assigned_nurse_id = p.id WHERE assigned_nurse_id = p.nurse_id;
      UPDATE care_tasks SET nurse_id = p.id          WHERE nurse_id = p.nurse_id;
      UPDATE profiles   SET nurse_id = p.id          WHERE id = p.id;

      DELETE FROM nurses
       WHERE id = p.nurse_id
         AND NOT EXISTS (SELECT 1 FROM profiles WHERE nurse_id = p.nurse_id)
         AND NOT EXISTS (SELECT 1 FROM patients WHERE assigned_nurse_id = p.nurse_id);
    END IF;
  END LOOP;
END $$;

-- Legacy nurses were tied to a whole tuman (nurses.village = tuman name): give them every
-- mahalla of that tuman so auto-assignment keeps working. Managers can narrow this down.
INSERT INTO nurse_territories (nurse_id, territory_id)
SELECT n.id, t.id
  FROM nurses n
  JOIN territories t ON lower(t.tuman) = lower(n.tuman)
 WHERE lower(n.village) = lower(n.tuman)
   AND NOT EXISTS (SELECT 1 FROM nurse_territories x WHERE x.nurse_id = n.id)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────
-- 6. Patients: contact info + territory link
-- ─────────────────────────────────────────────
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address text;

UPDATE patients p
   SET territory_id = t.id
  FROM territories t
 WHERE p.territory_id IS NULL
   AND lower(t.tuman) = lower(p.tuman)
   AND lower(t.village) = lower(p.village);

-- ─────────────────────────────────────────────
-- 7. Several medications per patient
--    (patients.drug_name / dosage keep the first drug for legacy screens)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_medications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    uuid NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
  drug_name     text NOT NULL,
  dosage        text NOT NULL,
  frequency     text,               -- e.g. "kuniga 2 marta"
  duration_days integer,
  instructions  text,               -- e.g. "ovqatdan keyin"
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS patient_medications_patient_idx ON patient_medications (patient_id, sort_order);
ALTER TABLE patient_medications ADD COLUMN IF NOT EXISTS stopped_at timestamptz;  -- set when the doctor stops a drug
ALTER TABLE patient_medications DISABLE ROW LEVEL SECURITY;

INSERT INTO patient_medications (patient_id, drug_name, dosage, duration_days, sort_order)
SELECT p.id, p.drug_name, p.dosage, p.expected_days, 0
  FROM patients p
 WHERE p.drug_name IS NOT NULL AND p.drug_name <> ''
   AND NOT EXISTS (SELECT 1 FROM patient_medications m WHERE m.patient_id = p.id);

-- ─────────────────────────────────────────────
-- 8. OTP the patient can read (AES-GCM ciphertext; otp_hash stays the verifier)
-- ─────────────────────────────────────────────
ALTER TABLE patient_otps ADD COLUMN IF NOT EXISTS otp_enc text;

-- ─────────────────────────────────────────────
-- 9. Nurse visit checklist progress (saved before the visit is confirmed)
-- ─────────────────────────────────────────────
ALTER TABLE care_tasks ADD COLUMN IF NOT EXISTS checklist_done text[] NOT NULL DEFAULT '{}';
