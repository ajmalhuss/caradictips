-- Heart Health Tips — initial schema plus the seeded tip library.
--
-- OceanBase (MySQL mode) notes:
--   * All DDL lives here, never in application code.
--   * No self-referencing foreign keys, no column+FK in one ALTER (we do neither).
--   * favourites.tip_id is a plain indexed column rather than a foreign key: tips
--     are reference content that is never deleted, so the constraint would only add
--     a failure mode on OceanBase's MySQL-compat path.

CREATE TABLE IF NOT EXISTS tips (
  id          INT           NOT NULL AUTO_INCREMENT,
  category    VARCHAR(40)   NOT NULL,
  title       VARCHAR(200)  NOT NULL,
  body        TEXT          NOT NULL,
  why         TEXT              NULL,
  sort_order  INT           NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_tips_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS favourites (
  id          INT           NOT NULL AUTO_INCREMENT,
  user_key    VARCHAR(255)  NOT NULL,
  tip_id      INT           NOT NULL,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fav_user_tip (user_key, tip_id),
  KEY idx_fav_tip (tip_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Seeded tips ────────────────────────────────────────────────────────────────
-- General patient education. Deliberately free of dosing advice and of anything
-- that would override an individual's care plan.

INSERT INTO tips (category, title, body, why, sort_order) VALUES
('nutrition', 'Shake the salt habit gradually',
 'Aim for under about a teaspoon of salt a day, and cut down slowly so your taste buds can adjust. Most salt comes from packaged and restaurant food, not the shaker, so read labels for ''sodium'' and choose the lower number. Herbs, citrus, garlic and vinegar bring flavour back without the salt.',
 'Cutting salt helps lower blood pressure, which takes strain off a heart that is already working harder than it should.', 10),

('nutrition', 'Fill half your plate with vegetables and fruit',
 'At most meals, make vegetables and fruit about half the plate, a quarter lean protein, and a quarter whole grains or starchy vegetables. Frozen and tinned counts — choose versions without added salt or syrup.',
 'This simple proportion naturally raises fibre and potassium while lowering saturated fat, and it needs no counting or measuring.', 20),

('nutrition', 'Swap saturated fat for unsaturated fat',
 'Choose olive or rapeseed oil instead of butter, nuts instead of crisps, and fish or skinless poultry in place of processed and fatty red meat. Keep fried and processed foods occasional rather than everyday.',
 'Replacing saturated fat with unsaturated fat is linked to better cholesterol levels and lower cardiovascular risk.', 30),

('nutrition', 'Watch the liquid calories and the alcohol',
 'Sugary drinks, sweetened juices and alcohol all add energy quickly without filling you up. If you drink, keep it modest and ask your care team whether alcohol interacts with your medicines.',
 'Excess weight, high triglycerides and raised blood pressure are all made worse by liquid calories — and alcohol can interact with several heart medicines.', 40),

('nutrition', 'Eat oily fish twice a week if you can',
 'Salmon, mackerel, sardines, herring and pilchards are good choices, and tinned is fine. If you do not eat fish, ask your care team about other sources of omega-3.',
 'Oily fish supplies omega-3 fats that support heart rhythm and help lower triglycerides.', 50),

('activity', 'Build up to 150 minutes a week — in small pieces',
 'Aim for about 30 minutes of moderate activity on most days, and it does not have to be in one block: three 10-minute walks count. Start where you are and add a few minutes each week rather than jumping in.',
 'Regular moderate activity strengthens the heart muscle, helps blood pressure and cholesterol, and improves mood and sleep. Short sessions count the same as long ones.', 110),

('activity', 'You should be able to talk while you walk',
 'Moderate means warm and slightly breathless but still able to hold a conversation. If you cannot speak in sentences, ease off. If you can sing, speed up.',
 'This ''talk test'' is a safe, simple way to judge intensity without gadgets, and it keeps you in the range that helps rather than strains the heart.', 120),

('activity', 'Add two light strength sessions a week',
 'Bodyweight moves, resistance bands or light weights, 8 to 12 gentle repetitions. Avoid holding your breath and avoid heavy straining.',
 'Strength work helps maintain muscle and mobility, which makes everyday activity easier and supports long-term independence.', 130),

('activity', 'Never start a new hard programme without asking first',
 'Before starting a new class, sport, or anything much more vigorous than your usual routine, check with your cardiology team — especially if you have had recent chest pain, a procedure, or you are unsure about your limits.',
 'Your safe upper limit depends on your diagnosis, your ejection fraction and your recent history. Your care team is the only one who knows those for you.', 140),

('medication', 'Take your medicines at the same time every day',
 'Tie each dose to something that already happens daily — brushing teeth, breakfast, the evening news. A weekly pill organiser or a phone alarm removes the need to remember.',
 'Most heart medicines only protect you while they are actually in your system. Steady levels are what keep blood pressure and rhythm stable.', 210),

('medication', 'Never stop a heart medicine on your own',
 'If a medicine is causing side effects or you are worried about it, contact your care team before you stop or change it. Many have to be tapered, and stopping suddenly can be dangerous.',
 'Abruptly stopping some heart medicines can cause rebound high blood pressure, rhythm problems or worse — a change is a conversation, not a decision to make alone.', 220),

('medication', 'Use a pill organiser and a single, current medicine list',
 'Keep one up-to-date list of everything you take — prescribed, over the counter, vitamins and supplements — and bring it to every appointment. Include the dose and how often.',
 'Duplicate or conflicting medicines are one of the most common avoidable causes of harm, and your care team can only spot a conflict if they can see everything.', 230),

('medication', 'Check before you take a painkiller',
 'Ask your pharmacist or care team before using regular anti-inflammatory painkillers such as ibuprofen or naproxen — paracetamol is usually the safer first choice for many people with heart disease.',
 'Some common painkillers can raise blood pressure and interact with heart medicines or blood thinners.', 240),

('monitoring', 'Know your own blood pressure numbers',
 'If you are asked to monitor at home, sit quietly for five minutes first, back supported, feet flat, arm at heart height. Take two readings a minute apart and write them down with the date and time.',
 'Home readings taken properly are more useful than a single surgery reading, and they show your care team how your pressure behaves in real life.', 310),

('monitoring', 'Weigh yourself on the same scale, at the same time',
 'Weigh yourself each morning after the toilet and before eating or drinking, in similar clothing, and note the number. Ask your care team what change should prompt a call.',
 'A weight gain of a few pounds over days can be an early sign of fluid building up from heart failure — well before swelling or breathlessness is obvious.', 320),

('monitoring', 'Learn the early signs of fluid building up',
 'Watch for swelling in the ankles or legs, shoes or rings feeling tight, needing more pillows at night to breathe comfortably, or feeling more breathless than usual on your normal walk.',
 'These are the classic early signs of worsening heart failure. Acting on them early often means a simple medication adjustment instead of a hospital stay.', 330),

('monitoring', 'Know your numbers and keep them somewhere findable',
 'Keep your blood pressure, cholesterol, weight, and recent test results in one place — this app, a notebook, or your phone. Bring them to appointments.',
 'Trends over time tell your care team far more than one reading, and you can answer their questions without guessing.', 340),

('lifestyle', 'If you smoke, the single biggest win is stopping',
 'Set a quit date and ask your care team about nicotine replacement or medication and local stop-smoking support. Cutting down is a start, but stopping is what delivers most of the benefit.',
 'Stopping smoking reduces heart attack and stroke risk quickly and substantially, at any age and after any diagnosis. It is the highest-value change most people can make.', 410),

('lifestyle', 'Aim for seven to nine hours of sleep',
 'Keep a regular bedtime and wake time, keep the room dark and cool, and avoid caffeine late in the day. Tell your care team if you snore heavily, gasp in your sleep, or wake unrefreshed.',
 'Poor sleep raises blood pressure and stress hormones. Loud snoring with daytime tiredness can be a sign of sleep apnoea, which is worth treating in its own right.', 420),

('lifestyle', 'Find one stress-relief habit that actually fits your day',
 'Five minutes of slow breathing, a short walk, a phone call with someone you like, or a hobby you protect in your diary — pick something realistic and repeatable rather than ambitious and rare.',
 'Long-term stress pushes up blood pressure and makes healthy routines harder to keep. A small habit you actually do beats a big plan you abandon.', 430),

('lifestyle', 'Ask for help with low mood',
 'Feeling flat, hopeless, or losing interest in things for more than a couple of weeks is worth raising with your care team, not something to push through quietly.',
 'Depression is common after a cardiac diagnosis and is linked to worse outcomes — and it is treatable. Saying so out loud is a medical step, not a weakness.', 440),

('lifestyle', 'Keep up your vaccinations',
 'Ask your care team which vaccinations are recommended for you — flu and pneumonia jabs are commonly advised for people with heart disease.',
 'Respiratory infections put extra strain on the heart and are a common trigger for hospital admissions that are largely preventable.', 450),

('warning', 'Call emergency services for chest pain that does not settle',
 'Chest pain or pressure that spreads to the arm, jaw, neck or back — especially with sweating, nausea or breathlessness — is an emergency. Stop, sit down, and call your local emergency number. Do not drive yourself.',
 'In a heart attack, time is heart muscle. Getting help in minutes rather than hours is the single biggest factor in how much damage is done.', 510),

('warning', 'Sudden severe breathlessness is an emergency',
 'Breathlessness that comes on quickly at rest, or that wakes you gasping, needs urgent assessment — especially with pink or frothy sputum, or if you cannot speak in full sentences.',
 'This can signal acute heart failure or a fluid build-up in the lungs, both of which need treatment straight away.', 520),

('warning', 'A racing, pounding or irregular heartbeat needs checking',
 'A sudden sustained fast or irregular heartbeat, especially with dizziness, chest discomfort or near-fainting, should be assessed urgently rather than waited out.',
 'Some rhythms are harmless and some are not, and the ones that matter can be settled quickly with the right treatment.', 530),

('warning', 'This app is education, not your care plan',
 'Nothing here replaces the advice of your own doctor, nurse or pharmacist. If your care team has given you specific targets, restrictions or instructions, follow those — they know your diagnosis, your test results and your medicines.',
 'Heart disease covers many different conditions, and two people with the same label can need very different limits. Your own care team is the authority on yours.', 540);