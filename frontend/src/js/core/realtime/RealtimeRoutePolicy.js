export function realtimeTopicsForPath(path) {
  if (path === '/admin-system/resources') return ['resources'];
  if (/\/(audit|history)$/.test(path)) return ['activity'];
  if (/enrollment-monitor/.test(path)) return ['students','schedules','payments'];
  if (path.startsWith('/cash')) return ['payments','students'];
  if (/student-profile|\/students(?:\/|$)/.test(path)) return ['students','schedules','payments','documents'];
  if (path.startsWith('/instructor')) return ['schedules','students'];
  if (/schedule|agenda/.test(path)) return ['schedules','students'];
  if (/documents|documentation/.test(path)) return ['documents','students'];
  if (/notifications/.test(path)) return ['notifications'];
  if (path === '/student') return ['students','schedules','payments','documents'];
  if (/\/admin-system\/(security|settings)/.test(path)) return ['authorization','admin'];
  if (path.startsWith('/admin-system/branches')) return ['admin','students','schedules','payments'];
  if (/manager|dashboard/.test(path) || path === '/') return ['students','schedules','payments','documents','admin'];
  if (/referral/.test(path)) return ['referrals'];
  return ['admin'];
}

export function relevantRealtimeTopics(path, topics) {
  const interests = realtimeTopicsForPath(path);
  return topics.filter(topic => topic === 'resync' || topic === 'authorization' || interests.includes(topic));
}
