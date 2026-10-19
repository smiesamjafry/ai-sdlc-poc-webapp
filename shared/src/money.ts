// All money is integer cents. Format only at the edges.
export const formatPrice = (cents: number): string =>
  `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;

/** Round half up for non-negative values (cents math never needs banker's rounding here). */
export const roundHalfUp = (value: number): number => Math.floor(value + 0.5 + 1e-9);
