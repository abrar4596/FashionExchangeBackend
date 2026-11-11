const cities = require('../data/indian-cities.json');

const normalize = (value) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const cityById = new Map(cities.map((city) => [city.id, city]));
const statesByCityName = new Map();
for (const city of cities) {
  const states = statesByCityName.get(normalize(city.name)) || new Set();
  states.add(city.state);
  statesByCityName.set(normalize(city.name), states);
}

const indexedCities = cities.map((city) => ({
  ...city,
  normalizedName: normalize(city.name),
  normalizedState: normalize(city.state),
  normalizedDistrict: normalize(city.district),
  normalizedLabel: normalize(`${city.name}, ${city.state}`),
}));

const searchCities = (query, limit = 20) => {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length < 2) return [];

  const results = [];
  for (const city of indexedCities) {
    let score = Infinity;
    if (city.normalizedName === normalizedQuery) score = 0;
    else if (city.normalizedName.startsWith(normalizedQuery)) score = 1;
    else if (city.normalizedLabel.startsWith(normalizedQuery)) score = 2;
    else if (city.normalizedName.includes(normalizedQuery)) score = 3;
    else if (city.normalizedState.startsWith(normalizedQuery)) score = 4;
    else if (city.normalizedDistrict.startsWith(normalizedQuery)) score = 5;
    else if (
      city.normalizedState.includes(normalizedQuery) ||
      city.normalizedDistrict.includes(normalizedQuery)
    ) score = 6;

    if (score !== Infinity) results.push({ city, score });
  }

  results.sort(
    (left, right) =>
      left.score - right.score ||
      left.city.name.localeCompare(right.city.name) ||
      left.city.state.localeCompare(right.city.state) ||
      left.city.district.localeCompare(right.city.district)
  );

  return results.slice(0, limit).map(({ city }) => ({
    id: city.id,
    name: city.name,
    state: city.state,
    state_code: city.state_code,
    district: city.district,
    tier: city.tier,
  }));
};

const resolveCityInput = (city, cityId) => {
  if (cityId !== undefined && cityId !== null && String(cityId).trim()) {
    const selectedCity = cityById.get(String(cityId).trim());
    if (!selectedCity) {
      const error = new Error('Please select a city from the location suggestions');
      error.statusCode = 400;
      throw error;
    }

    return {
      city: `${selectedCity.name}, ${selectedCity.state}`,
      cityId: selectedCity.id,
    };
  }

  if (city !== undefined && city !== null && typeof city !== 'string') {
    const error = new Error('City must be a string');
    error.statusCode = 400;
    throw error;
  }

  if (city && city.trim()) {
    return { city: city.trim(), cityId: undefined };
  }

  return null;
};

const isCityNameUniqueAcrossStates = (name) =>
  (statesByCityName.get(normalize(name)) || new Set()).size === 1;

const findCityIdForLegacyValue = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;

  const normalizedValue = normalize(value);
  const matches = indexedCities.filter((city) =>
    city.normalizedName === normalizedValue ||
    city.normalizedLabel === normalizedValue
  );
  return matches.length === 1 ? matches[0].id : null;
};

module.exports = {
  findCityIdForLegacyValue,
  isCityNameUniqueAcrossStates,
  resolveCityInput,
  searchCities,
};
