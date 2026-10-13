// Two weekdays after the start date; the deadline itself is included.
const deadlineSql = `(cc.start_date + CASE EXTRACT(ISODOW FROM cc.start_date)::integer
  WHEN 4 THEN 4 WHEN 5 THEN 4 WHEN 6 THEN 3 ELSE 2 END)`;

module.exports = { deadlineSql };
