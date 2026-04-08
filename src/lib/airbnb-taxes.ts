export type AirbnbTaxBreakdown = {
  tourismLevy: number;
  vat: number;
  dst: number;
  total: number;
  rates: {
    tourismLevy: number;
    vat: number;
    dst: number;
  };
};

const parseRate = (value: string | undefined, fallback: number) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export const getAirbnbTaxRates = () => ({
  tourismLevy: parseRate(process.env.AIRBNB_TOURISM_LEVY_RATE, 0.02),
  vat: parseRate(process.env.AIRBNB_VAT_RATE, 0.16),
  dst: parseRate(process.env.AIRBNB_DST_RATE, 0.015),
});

export const calculateAirbnbTaxes = (revenue: number): AirbnbTaxBreakdown => {
  const rates = getAirbnbTaxRates();
  const tourismLevy = revenue * rates.tourismLevy;
  const vat = revenue * rates.vat;
  const dst = revenue * rates.dst;
  return {
    tourismLevy,
    vat,
    dst,
    total: tourismLevy + vat + dst,
    rates,
  };
};
