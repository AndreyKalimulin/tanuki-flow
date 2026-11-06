import { DATA } from './data.js';
export const unitPrice = (product, mode) => product.salePrice ?? Math.round(product.price * (mode === 'pickup' ? .8 : 1));
export function changeQuantity(cart, id, delta) {
  if (!DATA.products[id] || !Number.isInteger(delta)) return { ...cart };
  const next = { ...cart }, quantity = Math.max(0, (next[id] || 0) + delta);
  if (quantity) next[id] = quantity; else delete next[id];
  return next;
}
export function totals(cart, mode) {
  let food = 0, original = 0, quantity = 0;
  for (const [id, count] of Object.entries(cart)) {
    const p = DATA.products[id];
    if (!p || !Number.isInteger(count) || count <= 0) continue;
    food += unitPrice(p, mode) * count; original += p.price * count; quantity += count;
  }
  const delivery = quantity && mode === 'delivery' ? 149 : 0;
  return { food, original, discount: original - food, delivery, total: food + delivery, bonus: Math.round(food * .1), quantity };
}
export function snapshot(cart, mode, time, number) {
  return { number, cart: { ...cart }, mode, time: time ? { ...time } : null, totals: totals(cart, mode), status: 'accepted', details: false };
}
