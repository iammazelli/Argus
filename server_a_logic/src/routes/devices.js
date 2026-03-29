const express = require('express');
const router  = express.Router();
const { listDevices, getDevice, createDevice, deleteDevice } = require('../controllers/deviceController');
const { getLatestReadings, getReadingHistory, getVariables } = require('../controllers/readingController');

// Devices
router.get('/',          listDevices);
router.get('/:id',       getDevice);
router.post('/',         createDevice);
router.delete('/:id',    deleteDevice);

// Readings
router.get('/:id/readings/latest',    getLatestReadings);
router.get('/:id/readings/history',   getReadingHistory);
router.get('/:id/readings/variables', getVariables);

module.exports = router;