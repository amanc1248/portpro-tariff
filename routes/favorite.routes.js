const express = require('express');
const router = express.Router();
const {
  getFavorites,
  addToFavorites,
  removeFromFavorites,
  removeByPropertyId,
  checkIfFavorited,
  updateNotes,
  clearAllFavorites
} = require('../controllers/favorite.controller');
const { protect } = require('../middleware/auth.middleware');
const { objectIdValidation, propertyIdValidation } = require('../utils/validators');

// All favorite routes require authentication
router.use(protect);

// ====================================
// FAVORITE ROUTES
// ====================================

/**
 * @route   GET /api/favorites
 * @desc    Get user's favorite properties
 * @access  Private
 * @query   page, limit, sort
 */
router.get('/', getFavorites);

/**
 * @route   POST /api/favorites
 * @desc    Add property to favorites
 * @access  Private
 * @body    { propertyId, notes (optional) }
 */
router.post('/', addToFavorites);

/**
 * @route   DELETE /api/favorites/clear
 * @desc    Clear all favorites for user
 * @access  Private
 */
router.delete('/clear', clearAllFavorites);

/**
 * @route   GET /api/favorites/check/:propertyId
 * @desc    Check if property is favorited by user
 * @access  Private
 */
router.get('/check/:propertyId', propertyIdValidation, checkIfFavorited);

/**
 * @route   DELETE /api/favorites/property/:propertyId
 * @desc    Remove property from favorites by property ID
 * @access  Private
 */
router.delete('/property/:propertyId', propertyIdValidation, removeByPropertyId);

/**
 * @route   DELETE /api/favorites/:id
 * @desc    Remove property from favorites by favorite ID
 * @access  Private
 */
router.delete('/:id', objectIdValidation, removeFromFavorites);

/**
 * @route   PUT /api/favorites/:id/notes
 * @desc    Update favorite notes
 * @access  Private
 * @body    { notes }
 */
router.put('/:id/notes', objectIdValidation, updateNotes);

module.exports = router;

