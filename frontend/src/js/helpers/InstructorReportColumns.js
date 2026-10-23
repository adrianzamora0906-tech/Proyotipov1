export function formatInstructorCoursePeriod(item) {
  if (!item.start_date || !item.end_date) return 'Sin fecha';
  const start = new Date(`${String(item.start_date).slice(0, 10)}T00:00:00`);
  const end = new Date(`${String(item.end_date).slice(0, 10)}T00:00:00`);
  const format = (date) => date.toLocaleDateString('es-EC', { day: 'numeric', month: 'long' });
  return start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()
    ? `Del ${start.getDate()} al ${format(end)}`
    : `Del ${format(start)} al ${format(end)}`;
}

export function addInstructorScheduleColumns(container, items) {
  const header = container.querySelector('thead tr');
  if (!header) return;
  for (const [index, label] of ['Horario', 'Atencion'].entries()) {
    const cell = document.createElement('th');
    cell.textContent = label;
    header.insertBefore(cell, header.children[index === 0 ? 0 : 3]);
  }
  container.querySelectorAll('tbody tr').forEach((row, index) => {
    const item = items[index];
    for (const [column, value] of [item.schedule_time || 'Sin horario', item.activity_type === 'EXAM_ONLY' ? 'Formación intensiva' : item.activity_type === 'ADDITIONAL_PRACTICE' ? 'Horas prácticas' : 'Clases'].entries()) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.insertBefore(cell, row.children[column === 0 ? 0 : 3]);
    }
    const scheduled = document.createElement('td');
    scheduled.textContent = `${Number(item.scheduled_hours || 0).toLocaleString('es-EC')} h`;
    row.append(scheduled);
  });
  const scheduledHeader = document.createElement('th');
  scheduledHeader.textContent = 'Horas programadas';
  header.append(scheduledHeader);
}
