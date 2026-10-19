// Small in-memory cache, partitioned by authorization context; never persisted.
const entries = new Map();
let generation = 0;
export function clearStudentReadCache(studentId = null, sections = null) {
  generation++;
  for (const [key, entry] of entries) if ((!studentId || entry.studentId === studentId) && (!sections || sections.includes(entry.section.split(':')[0]))) entries.delete(key);
}
export async function readStudentCached(scope, studentId, section, load) {
  const key = JSON.stringify([scope,studentId,section]);
  const now = Date.now();
  for (const [oldKey, entry] of entries) if (entry.expires <= now) entries.delete(oldKey);
  const previous = entries.get(key);
  if (previous) return previous.promise;
  const version = generation;
  const entry = {studentId,section,expires:now+30000,promise:null};
  entry.promise = Promise.resolve().then(load).then(value => {
    if (value == null || value.success === false || generation !== version) { if (entries.get(key) === entry) entries.delete(key); }
    return value;
  }, error => { if (entries.get(key) === entry) entries.delete(key); throw error; });
  entries.set(key,entry);
  while (entries.size > 20) entries.delete(entries.keys().next().value);
  return entry.promise;
}
for (const event of ['erp:sessionChanged','auth:changed']) window.addEventListener(event, () => clearStudentReadCache());
