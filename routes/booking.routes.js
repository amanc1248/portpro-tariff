const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { propertyIdValidation, objectIdValidation } = require('../utils/validators');
const {
  createBookingRequest,
  getMyRequests,
  getPropertyRequests,
  getOwnerRequests,
  acceptBookingRequest,
  rejectBookingRequest,
  cancelBookingRequest,
  checkBookingStatus
} = require('../controllers/booking.controller');

router.use(protect);

router.post('/request', createBookingRequest);
router.get('/my-requests', getMyRequests);
router.get('/owner-requests', getOwnerRequests);
router.get('/property/:propertyId', propertyIdValidation, getPropertyRequests);
router.get('/check/:propertyId', propertyIdValidation, checkBookingStatus);
router.patch('/:id/accept', objectIdValidation, acceptBookingRequest);
router.patch('/:id/reject', objectIdValidation, rejectBookingRequest);
router.patch('/:id/cancel', objectIdValidation, cancelBookingRequest);

module.exports = router;
