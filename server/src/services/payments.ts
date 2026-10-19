// Mock payment provider. Synchronous and in-process: no network, no side effects outside our transaction.
// A real provider (P2) needs reserve-stock-then-charge instead of holding row locks across the call.
export type ChargeResult = { ok: true; ref: string } | { ok: false; reason: string };

export interface PaymentProvider {
  charge(cardNumber: string, amountCents: number): ChargeResult;
}

export const TEST_CARDS = {
  success: "4242424242424242",
  decline: "4000000000000002",
  insufficientFunds: "4000000000009995",
};

export const mockProvider: PaymentProvider = {
  charge(cardNumber, amountCents) {
    if (amountCents <= 0) return { ok: true, ref: "mock_zero" };
    if (cardNumber === TEST_CARDS.success) return { ok: true, ref: `mock_${Date.now()}` };
    if (cardNumber === TEST_CARDS.decline) return { ok: false, reason: "Your card was declined." };
    if (cardNumber === TEST_CARDS.insufficientFunds) return { ok: false, reason: "Your card has insufficient funds." };
    return { ok: false, reason: "Unsupported test card. Use 4242 4242 4242 4242." };
  },
};

export const charge = (cardNumber: string, amountCents: number) => mockProvider.charge(cardNumber, amountCents);
