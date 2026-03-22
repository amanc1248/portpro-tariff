const express = require('express');
const router = express.Router();
const {
  getProperties,
  getFeaturedProperties,
  getExploreData,
  getProperty,
  createProperty,
  updateProperty,
  deleteProperty,
  getMyListings,
  updatePropertyStatus,
  incrementViews,
  incrementCallClicks
} = require('../controllers/property.controller');
const { protect, isOwner } = require('../middleware/auth.middleware');
const { uploadPropertyImages, handleUploadErrors } = require('../middleware/upload.middleware');
const {
  createPropertyValidation,
  objectIdValidation
} = require('../utils/validators');

// ====================================
// PUBLIC ROUTES
// ====================================

/**
 * @route   GET /api/properties
 * @desc    Get all properties with filters and pagination
 * @access  Public
 * @query   city, area, minRent, maxRent, propertyType, amenities, status, page, limit, sort
 */
router.get('/', getProperties);

/**
 * @route   GET /api/properties/featured
 * @desc    Get featured properties
 * @access  Public
 * @query   limit (default: 10)
 */
router.get('/featured', getFeaturedProperties);

/**
 * @route   GET /api/properties/explore
 * @desc    Get explore data — properties grouped by city
 * @access  Public
 * @query   propertyType, perCity
 */
router.get('/explore', getExploreData);

/**
 * @route   GET /api/properties/:id
 * @desc    Get single property by ID
 * @access  Public
 */
router.get('/:id', objectIdValidation, getProperty);

/**
 * @route   POST /api/properties/:id/view
 * @desc    Increment property views
 * @access  Public
 */
router.post('/:id/view', objectIdValidation, incrementViews);

/**
 * @route   POST /api/properties/:id/call
 * @desc    Increment property call clicks
 * @access  Public
 */
router.post('/:id/call', objectIdValidation, incrementCallClicks);

// ====================================
// PROTECTED ROUTES (require authentication)
// ====================================

/**
 * @route   GET /api/properties/me/listings
 * @desc    Get user's own properties
 * @access  Private (Owner/Both)
 */
router.get('/me/listings', protect, getMyListings);

/**
 * @route   POST /api/properties
 * @desc    Create new property
 * @access  Private (Owner/Both)
 */
router.post(
  '/',
  protect,
  isOwner,
  uploadPropertyImages,
  handleUploadErrors,
  createProperty
);

/**
 * @route   PUT /api/properties/:id
 * @desc    Update property
 * @access  Private (Owner of property)
 */
router.put(
  '/:id',
  protect,
  objectIdValidation,
  uploadPropertyImages,
  handleUploadErrors,
  updateProperty
);

/**
 * @route   DELETE /api/properties/:id
 * @desc    Delete property
 * @access  Private (Owner of property)
 */
router.delete('/:id', protect, objectIdValidation, deleteProperty);

/**
 * @route   PATCH /api/properties/:id/status
 * @desc    Update property status (available/rented)
 * @access  Private (Owner of property)
 */
router.patch('/:id/status', protect, objectIdValidation, updatePropertyStatus);

module.exports = router;

