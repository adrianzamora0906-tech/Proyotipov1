const { randomUUID } = require('node:crypto');
class ScheduleSelectionHolds {
  constructor(now = Date.now) { this.now = now; this.owners = new Map(); }
  prune() {
    for (const [owner, hold] of this.owners) if (hold.expires <= this.now()) this.owners.delete(owner);
  }
  replace(owner, slots) {
    this.prune();
    if (!Array.isArray(slots) || slots.length > 32) throw new Error('Invalid selection');
    const uuid = /^[a-f0-9-]{36}$/i;
    const normalized = slots.map(slot => {
      const mode = slot.mode || 'classes';
      if (!['classes','exam_only'].includes(mode)) throw new Error('Invalid selection mode');
      if (!uuid.test(slot.instructorId) || !uuid.test(slot.cycleId)
        || !/^\d{4}-\d{2}-\d{2}$/.test(slot.date)
        || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.start)
        || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.end) || slot.end <= slot.start) throw new Error('Invalid selection');
      return { instructorId: slot.instructorId, cycleId: slot.cycleId, date: slot.date, start: slot.start, end: slot.end, mode };
    });
    if (normalized.some(slot => slot.mode === 'exam_only') && normalized.length !== 1) throw new Error('Single exam required');
    const conflict = normalized.some(slot => {
      const competing = [...this.owners].filter(([other, hold]) => other !== owner && hold.slots.some(held =>
        (held.mode || 'classes') === slot.mode && held.instructorId === slot.instructorId && held.date === slot.date
          && (slot.mode === 'exam_only' ? held.start === slot.start : held.start < slot.end && held.end > slot.start)));
      return competing.length >= (slot.mode === 'exam_only' ? 2 : 1);
    });
    if (conflict) return false;
    if (!normalized.length) this.owners.delete(owner);
    else this.owners.set(owner, { id: this.owners.get(owner)?.id || randomUUID(), slots: normalized, expires: this.now() + 90000 });
    return true;
  }
  snapshot(owner) {
    this.prune();
    return [...this.owners].map(([key, hold]) => ({ ...hold, mine: key === owner }));
  }
}
module.exports = ScheduleSelectionHolds;
