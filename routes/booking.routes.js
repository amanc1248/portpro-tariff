const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
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
router.get('/property/:propertyId', getPropertyRequests);
router.get('/check/:propertyId', checkBookingStatus);
router.patch('/:id/accept', acceptBookingRequest);
router.patch('/:id/reject', rejectBookingRequest);
router.patch('/:id/cancel', cancelBookingRequest);

module.exports = router;
