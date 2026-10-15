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
      if (!uuid.test(slot.instructorId) || !uuid.test(slot.cycleId)
        || !/^\d{4}-\d{2}-\d{2}$/.test(slot.date)
        || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.start)
        || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.end) || slot.end <= slot.start) throw new Error('Invalid selection');
      return { instructorId: slot.instructorId, cycleId: slot.cycleId, date: slot.date, start: slot.start, end: slot.end };
    });
    const conflict = [...this.owners].some(([other, hold]) => other !== owner && normalized.some(slot =>
      hold.slots.some(held => held.instructorId === slot.instructorId && held.date === slot.date
        && held.start < slot.end && held.end > slot.start)));
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
