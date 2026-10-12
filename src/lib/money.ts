/**
 * Money rounding, in one place.
 *
 * `Math.round(10.075 * 100)` is 1007, not 1008, because 10.075 * 100 evaluates to
 * 1007.4999999999999 in binary floating point. Every amount that is validated,
 * converted from a foreign currency, or split used its own copy of that expression, so the same
 * number could land on different paisa depending on which path it took. Fifteen
 * significant digits is the most a double carries reliably, so rounding the scaled
 * value to that first strips the representation noise without disturbing a real
 * half-paisa. Halves round away from zero, the way a person doing it by hand would.
 */

const PAISA = 100;
const SIGNIFICANT_DIGITS = 15;

/** A number of rupees as whole paisa. */
export function toPaisa(amount: number): number {
  if (!Number.isFinite(amount)) return amount;
  const scaled = Number((Math.abs(amount) * PAISA).toPrecision(SIGNIFICANT_DIGITS));
  return Math.sign(amount) * Math.round(scaled);
}

/** A number of rupees rounded to the paisa. */
export function roundMoney(value: number): number {
  const paisa = toPaisa(value);
  return Number.isFinite(paisa) ? paisa / PAISA : paisa;
}
