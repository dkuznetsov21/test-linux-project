import { allFakers } from '@faker-js/faker';
import countries from 'world-countries';

const FAKER_LOCALE_BY_COUNTRY = {
  AE: 'ar',
  AM: 'hy',
  AR: 'es',
  AT: 'de_AT',
  AU: 'en_AU',
  AZ: 'az',
  BD: 'bn_BD',
  BE: 'nl_BE',
  BR: 'pt_BR',
  CA: 'en_CA',
  CH: 'de_CH',
  CN: 'zh_CN',
  CZ: 'cs_CZ',
  DE: 'de',
  DK: 'da',
  ES: 'es',
  FI: 'fi',
  FR: 'fr',
  GB: 'en_GB',
  GE: 'ka_GE',
  GH: 'en_GH',
  GR: 'el',
  HK: 'en_HK',
  HR: 'hr',
  HU: 'hu',
  ID: 'id_ID',
  IE: 'en_IE',
  IL: 'he',
  IN: 'en_IN',
  IT: 'it',
  JP: 'ja',
  KR: 'ko',
  LV: 'lv',
  MK: 'mk',
  MX: 'es_MX',
  NG: 'en_NG',
  NL: 'nl',
  NO: 'nb_NO',
  NZ: 'en_AU',
  PL: 'pl',
  PT: 'pt_PT',
  RO: 'ro',
  RS: 'sr_RS_latin',
  RU: 'ru',
  SE: 'sv',
  SK: 'sk',
  SN: 'fr_SN',
  TH: 'th',
  TR: 'tr',
  TW: 'zh_TW',
  UA: 'uk',
  US: 'en_US',
  UY: 'es',
  UZ: 'uz_UZ_latin',
  VN: 'vi',
  ZA: 'en_ZA',
};

const COUNTRY_OVERRIDES = {
  KR: {
    cities: ['Seoul', 'Busan', 'Incheon', 'Daegu', 'Daejeon', 'Gwangju', 'Suwon', 'Ulsan'],
    areas: ['Seoul', 'Busan', 'Incheon', 'Gyeonggi-do', 'Daegu', 'Daejeon', 'Gwangju', 'Ulsan'],
    zipCode: { min: 10000, max: 63999 },
  },
  NZ: {
    cities: ['Auckland', 'Wellington', 'Christchurch', 'Hamilton', 'Dunedin', 'Tauranga', 'Rotorua', 'Napier'],
    areas: ['Auckland', 'Wellington', 'Canterbury', 'Waikato', 'Otago', 'Bay of Plenty', 'Hawke\'s Bay'],
    zipCode: { min: 1000, max: 9999 },
  },
  TH: {
    cities: ['Bangkok', 'Chiang Mai', 'Phuket', 'Pattaya', 'Nonthaburi', 'Khon Kaen', 'Hat Yai', 'Nakhon Ratchasima'],
    areas: ['Bangkok', 'Chiang Mai', 'Phuket', 'Chonburi', 'Nonthaburi', 'Khon Kaen', 'Songkhla', 'Nakhon Ratchasima'],
    zipCode: { min: 10000, max: 99999 },
  },
};

function getCallingCode(country) {
  const suffix = country.idd.suffixes?.[0];

  if (!country.idd.root) {
    return '+000';
  }

  if (!suffix || country.idd.suffixes.length > 1) {
    return country.idd.root;
  }

  return `${country.idd.root}${suffix}`;
}

function getCountryConfig(geo) {
  const country = countries.find((item) => item.cca2 === geo);

  if (!country) {
    throw new Error(`Unsupported Geo "${geo}". Use a valid ISO 3166-1 alpha-2 country code, for example US, GB, AU, TH, KR, DE.`);
  }

  return {
    locale: FAKER_LOCALE_BY_COUNTRY[geo] ?? 'en',
    country: country.name.common,
    callingCode: getCallingCode(country),
    ...(COUNTRY_OVERRIDES[geo] ?? {}),
  };
}

function getFakerForCountry(config) {
  const faker = allFakers[config.locale] ?? allFakers.en;

  if (!faker) {
    throw new Error(`Faker locale "${config.locale}" is not available`);
  }

  return faker;
}

function safeFake(getValue, fallback) {
  try {
    const value = getValue();

    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  } catch {
    // Some localized faker datasets do not provide every location field.
  }

  return fallback;
}

function randomDigits(faker, length) {
  return Array.from({ length }, () => faker.number.int({ min: 0, max: 9 })).join('');
}

function randomNumber(faker, range) {
  return String(faker.number.int(range)).padStart(String(range.max).length, '0');
}

function pickConfiguredValue(faker, values, fallback) {
  if (!Array.isArray(values) || values.length === 0) {
    return fallback;
  }

  return faker.helpers.arrayElement(values);
}

function buildPhoneNumber(faker, config) {
  return `${config.callingCode} ${randomDigits(faker, 3)} ${randomDigits(faker, 3)} ${randomDigits(faker, 3)}`;
}

function buildZipCode(faker, config) {
  if (config.zipCode) {
    return randomNumber(faker, config.zipCode);
  }

  return safeFake(() => faker.location.zipCode(), '00000');
}

function buildAddress(faker, config) {
  const city = pickConfiguredValue(faker, config.cities, safeFake(() => faker.location.city(), 'Unknown city'));

  return [
    `Street: ${safeFake(() => faker.location.streetAddress(), 'Unknown street')}`,
    `City: ${city}`,
    `State/province/area: ${pickConfiguredValue(faker, config.areas, safeFake(() => faker.location.state(), city))}`,
    `Phone number: ${buildPhoneNumber(faker, config)}`,
    `Zip code: ${buildZipCode(faker, config)}`,
    `Country calling code: ${config.callingCode}`,
    `Country: ${config.country}`,
  ].join('; ');
}

export function buildAddressBlock(domains, geo) {
  const config = getCountryConfig(geo);
  const faker = getFakerForCountry(config);

  return domains
    .map(() => buildAddress(faker, config))
    .join('; ');
}
