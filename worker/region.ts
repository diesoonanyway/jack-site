export type CloudflareRegionProperties = {
  country?: string | null;
  isEUCountry?: string | boolean | null;
};

const REGULATED_COUNTRIES = new Set([
  // European Union
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI',
  'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU',
  'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  // EEA members outside the EU, plus the United Kingdom and Switzerland
  'IS', 'LI', 'NO', 'GB', 'CH',
]);

const UNKNOWN_COUNTRY_CODES = new Set(['XX', 'T1']);

export function getRegulatedRegion(
  cf: CloudflareRegionProperties | null | undefined,
): boolean | null {
  if (cf?.isEUCountry === '1' || cf?.isEUCountry === true) {
    return true;
  }

  if (typeof cf?.country !== 'string') {
    return null;
  }

  const country = cf.country.trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(country) || UNKNOWN_COUNTRY_CODES.has(country)) {
    return null;
  }

  return REGULATED_COUNTRIES.has(country);
}
