const express = require('express');
const { searchCityLocations } = require('../controllers/locationController');

const router = express.Router();

router.get('/cities', searchCityLocations);

module.exports = router;
