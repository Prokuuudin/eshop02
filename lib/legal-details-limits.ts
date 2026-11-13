/**
 * Longest company legal address accepted anywhere it is entered. The order route rejects longer
 * legal details, so every input that can feed a checkout (admin client edit, account profile,
 * checkout form) must stop at the same length or the customer's next order would fail.
 */
export const LEGAL_ADDRESS_MAX_LENGTH = 300
