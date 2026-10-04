export type CountryOption = {
  code: string;
  name: string;
  flag: string;
  timezone: string;
};

export type LocaleOption = {
  code: string;
  name: string;
};

export type CurrencyOption = {
  code: string;
  name: string;
};

export const countries: CountryOption[] = [
  { code: "CO", name: "Colombia", flag: "🇨🇴", timezone: "America/Bogota" },
];

export const languages: LocaleOption[] = [
  { code: "es", name: "Español" },
  { code: "en", name: "English" },
  { code: "pt", name: "Português" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "it", name: "Italiano" },
  { code: "ja", name: "日本語" },
  { code: "zh", name: "中文" },
];

export const currencies: CurrencyOption[] = [
  { code: "COP", name: "Peso colombiano" },
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "MXN", name: "Peso mexicano" },
  { code: "BRL", name: "Real brasileño" },
  { code: "CLP", name: "Peso chileno" },
  { code: "ARS", name: "Peso argentino" },
  { code: "PEN", name: "Sol peruano" },
  { code: "CAD", name: "Dólar canadiense" },
  { code: "AUD", name: "Dólar australiano" },
  { code: "JPY", name: "Yen japonés" },
  { code: "CNY", name: "Yuan chino" },
  { code: "CHF", name: "Franco suizo" },
];

export const defaultMarketConfig = {
  countryCode: "CO",
  languageCode: "es",
  currencyCode: "COP",
  timezone: "America/Bogota",
};

export const formatCurrencyName = (currency: CurrencyOption) =>
  `${currency.code} — ${currency.name}`;
