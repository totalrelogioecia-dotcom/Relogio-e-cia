const MIN_INSTALLMENT_CENTS = 5000;
const MAX_INSTALLMENTS = 12;

function maxInstallmentsForAmount(amount) {
  const totalCents = Math.max(0, Math.round(Number(amount || 0) * 100));
  const byMinimum = Math.floor(totalCents / MIN_INSTALLMENT_CENTS);
  return Math.max(1, Math.min(MAX_INSTALLMENTS, byMinimum));
}

module.exports = {
  MIN_INSTALLMENT_CENTS,
  MAX_INSTALLMENTS,
  maxInstallmentsForAmount
};
