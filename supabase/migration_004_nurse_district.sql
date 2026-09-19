-- MedCare — migration_004_nurse_district.sql
-- Adds tuman (district) to nurses and patients so a new patient is routed to
-- the nearest nurse covering their own tuman, refined by mahalla/qishloq when
-- an exact match exists. Existing village values already are tuman names
-- (Xazorasp, Bog'ot, Shovot), so they backfill tuman directly.

alter table nurses add column if not exists tuman text;
update nurses set tuman = village where tuman is null;
alter table nurses alter column tuman set not null;

alter table patients add column if not exists tuman text;
update patients set tuman = village where tuman is null;
alter table patients alter column tuman set not null;
