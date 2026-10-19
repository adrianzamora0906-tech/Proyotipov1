// Only opaque student references are compared; payloads contain no student records.
const relevant = new Set(['students','payments','documents','schedules','activity','authorization','resync','admin']);
export async function studentChangeKey(id) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2,'0')).join('');
}
export function subscribeStudentChanges(id, callback) {
  let stopped = false, timer;
  const pending = new Set();
  const key = studentChangeKey(id).catch(() => null);
  const listener = async event => {
    const detail = event.detail || {};
    const topics = detail.topics || (detail.collection ? [detail.collection] : []);
    const targetKey = await key;
    if (stopped) return;
    for (const topic of topics) {
      if (!relevant.has(topic)) continue;
      if (detail.studentId && detail.studentId !== id) continue;
      const changes = Array.isArray(detail.changes) ? detail.changes.filter(change => change.topic === topic) : [];
      if (targetKey && changes.length && !changes.some(change => !change.studentKey || change.studentKey === targetKey)) continue;
      pending.add(topic);
    }
    if (!pending.size) return;
    clearTimeout(timer);
    timer = setTimeout(() => { const topics = [...pending]; pending.clear(); if (!stopped) callback(topics); }, 250);
  };
  window.addEventListener('erp:realtime', listener);
  window.addEventListener('erp:dataChanged', listener);
  return () => { stopped = true; clearTimeout(timer); window.removeEventListener('erp:realtime',listener); window.removeEventListener('erp:dataChanged',listener); };
}
export function affectedStudentSections(topics) {
  if (topics.some(topic => ['students','authorization','resync','admin'].includes(topic))) return null;
  const sections = new Set();
  if (topics.includes('payments')) for (const section of ['balance','payments','receipts','history']) sections.add(section);
  if (topics.includes('documents')) for (const section of ['documents','history']) sections.add(section);
  if (topics.includes('schedules')) for (const section of ['detail','schedule','attendance','history']) sections.add(section);
  if (topics.includes('activity')) sections.add('history');
  return [...sections];
}
