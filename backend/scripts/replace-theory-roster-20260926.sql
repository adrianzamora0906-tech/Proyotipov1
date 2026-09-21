-- Replace the theoretical roster for 2026-09-26.
-- Morning group: 08:00-12:30. Afternoon group: 13:00-17:30.

BEGIN;

CREATE TEMP TABLE requested_theory_roster (identification TEXT PRIMARY KEY) ON COMMIT DROP;

INSERT INTO requested_theory_roster (identification) VALUES
  ('1351554736'),
  ('1313594762'),
  ('0962172104'),
  ('9999988020'),
  ('9999988024'),
  ('1729433357'),
  ('1352580337'),
  ('9999988023'),
  ('1308428661'),
  ('9999988025'),
  ('1316819893'),
  ('1350514517'),
  ('9999988007'),
  ('9999988022'),
  ('1351232697'),
  ('0803709823'),
  ('1314618826'),
  ('1316318060'),
  ('9999988016'),
  ('1314213396'),
  ('9999988021'),
  ('1316886730'),
  ('9999988003'),
  ('1350528046'),
  ('1351573710');

WITH target_groups AS (
  SELECT id, start_time
  FROM theory_course_groups
  WHERE start_date = DATE '2026-09-26'
    AND modality = 'presencial_intensivo'
    AND start_time IN (TIME '08:00', TIME '13:00')
    AND status <> 'cancelado'
),
deactivated AS (
  UPDATE theory_group_students gs
  SET active = FALSE
  WHERE gs.group_id IN (SELECT id FROM target_groups)
  RETURNING gs.id
)
SELECT COUNT(*) AS deactivated_assignments FROM deactivated;

WITH morning_group AS (
  SELECT id
  FROM theory_course_groups
  WHERE start_date = DATE '2026-09-26'
    AND modality = 'presencial_intensivo'
    AND start_time = TIME '08:00'
    AND status <> 'cancelado'
  LIMIT 1
),
students_to_assign AS (
  SELECT s.id AS student_id, e.id AS enrollment_id, mg.id AS group_id
  FROM requested_theory_roster requested
  JOIN students s ON s.identification = requested.identification
  CROSS JOIN morning_group mg
  JOIN LATERAL (
    SELECT en.id
    FROM enrollments en
    WHERE en.student_id = s.id
    ORDER BY en.created_at DESC NULLS LAST, en.id DESC
    LIMIT 1
  ) e ON TRUE
)
INSERT INTO theory_group_students (group_id, enrollment_id, student_id, assigned_by, active)
SELECT group_id, enrollment_id, student_id, NULL, TRUE
FROM students_to_assign
ON CONFLICT (enrollment_id) DO UPDATE
SET group_id = EXCLUDED.group_id,
    student_id = EXCLUDED.student_id,
    active = TRUE,
    assigned_at = NOW();

COMMIT;

SELECT g.start_date, g.start_time, g.end_time, COUNT(gs.id)::int AS active_students
FROM theory_course_groups g
LEFT JOIN theory_group_students gs
  ON gs.group_id = g.id AND gs.active = TRUE
WHERE g.start_date = DATE '2026-09-26'
  AND g.modality = 'presencial_intensivo'
  AND g.start_time IN (TIME '08:00', TIME '13:00')
GROUP BY g.id, g.start_date, g.start_time, g.end_time
ORDER BY g.start_time;