const { searchCities } = require('../utils/location');

const searchCityLocations = (req, res) => {
  const query = req.query.q;
  if (query !== undefined && typeof query !== 'string') {
    return res.status(400).json({ message: 'Search query must be a string' });
  }

  const requestedLimit = req.query.limit === undefined ? 20 : Number(req.query.limit);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
    return res.status(400).json({ message: 'Limit must be a positive integer' });
  }

  const limit = Math.min(requestedLimit, 20);
  return res.json({
    cities: query ? searchCities(query, limit) : [],
  });
};

module.exports = { searchCityLocations };
