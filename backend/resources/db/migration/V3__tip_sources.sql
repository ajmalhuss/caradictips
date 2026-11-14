-- V3 — source attribution for the seeded tips (PRD C8).
--
-- These record the guideline each tip is consistent with. They are NOT a clinical
-- sign-off: `reviewed_on` and `reviewed_by` stay NULL until a named clinician
-- approves the wording (C1), and the app reports those tips as unreviewed.
--
-- Sources are cited generically (issuing body + document), not as a claim that a
-- particular edition was checked line by line. Confirm the current edition when
-- the clinical review happens, and update this column then.
--
-- OceanBase (MySQL mode): plain UPDATEs against VARCHAR columns, no DDL.

UPDATE tips SET source = 'WHO. Guideline: Sodium intake for adults and children (2012).'
WHERE id = 1;

UPDATE tips SET source = 'European Society of Cardiology. 2021 ESC Guidelines on cardiovascular disease prevention in clinical practice — dietary pattern section.'
WHERE id IN (2, 3, 5);

UPDATE tips SET source = 'NHS. Eat well — alcohol and heart health; ESC 2021 prevention guidelines, weight section.'
WHERE id = 4;

UPDATE tips SET source = 'ESC 2021 prevention guidelines — physical activity recommendations.'
WHERE id IN (6, 7, 8);

UPDATE tips SET source = 'AHA/ACC. Discuss new exercise programmes with your care team — general safety advice for people with established cardiac disease.'
WHERE id = 9;

UPDATE tips SET source = 'NICE / MHRA general advice on medication adherence; local cardiac rehabilitation practice.'
WHERE id IN (10, 11, 12);

UPDATE tips SET source = 'NHS. NSAIDs and heart risk: take the lowest dose for the shortest time, and check with a pharmacist — not a dosing recommendation.'
WHERE id = 13;

UPDATE tips SET source = 'NICE NG136. Hypertension in adults: diagnosis and management — home blood pressure monitoring.'
WHERE id = 14;

UPDATE tips SET source = 'NICE NG106 / ESC. Heart failure guidance — daily weight monitoring and fluid retention signs.'
WHERE id IN (15, 16);

UPDATE tips SET source = 'British Heart Foundation. Know your numbers.'
WHERE id = 17;

UPDATE tips SET source = 'NICE NG209. Tobacco: preventing uptake, promoting quitting and treating dependence.'
WHERE id = 18;

UPDATE tips SET source = 'AASM/Sleep Foundation general sleep-duration guidance; ESC 2021 lifestyle section.'
WHERE id = 19;

UPDATE tips SET source = 'NICE. Mental wellbeing and stress — general advice; cardiac rehabilitation psychosocial support.'
WHERE id IN (20, 21);

UPDATE tips SET source = 'NHS. Vaccinations for adults with heart conditions (flu, COVID-19, pneumococcal).'
WHERE id = 22;

UPDATE tips SET source = 'NICE CG95 / Resuscitation Council UK. Chest pain of recent onset; emergency response guidance. Emergency number wording is deliberately locale-neutral.'
WHERE id IN (23, 24, 25);

UPDATE tips SET source = 'This app''s own editorial policy (PRD §7): general education only, defer to the treating clinician.'
WHERE id = 26;