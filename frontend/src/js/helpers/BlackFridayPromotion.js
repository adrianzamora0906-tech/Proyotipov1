export const BLACK_FRIDAY_PRICES = Object.freeze({ moto: 100, carro: 156 });
export function isBlackFridayPromotionActive(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const date = values.year + '-' + values.month + '-' + values.day;
  return date >= '2026-11-27' && date <= '2026-11-29';
}
