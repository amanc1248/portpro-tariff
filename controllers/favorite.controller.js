const Favorite = require('../models/Favorite');
const Property = require('../models/Property');
const asyncHandler = require('../utils/asyncHandler');

/**
 * @desc    Get user's favorite properties
 * @route   GET /api/favorites
 * @access  Private
 */
const ALLOWED_FAVORITE_SORTS = ['-createdAt', 'createdAt', '-notes', 'notes'];

exports.getFavorites = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, sort = '-createdAt' } = req.query;
  const safeSort = ALLOWED_FAVORITE_SORTS.includes(sort) ? sort : '-createdAt';

  const skip = (page - 1) * limit;

  const favorites = await Favorite.find({ user: req.user._id })
    .sort(safeSort)
    .skip(skip)
    .limit(parseInt(limit))
    .populate({
      path: 'property',
      select: 'title propertyType rent location images status isPremium isFeatured owner',
      populate: {
        path: 'owner',
        select: 'name phone photoURL rating isVerified'
      }
    })
    .lean();

  // Filter out favorites where property might have been deleted
  const validFavorites = favorites.filter(fav => fav.property !== null);

  const total = await Favorite.countDocuments({ user: req.user._id });

  res.status(200).json({
    success: true,
    count: validFavorites.length,
    total,
    favorites: validFavorites,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
      hasMore: page * limit < total
    }
  });
});

/**
 * @desc    Add property to favorites
 * @route   POST /api/favorites
 * @access  Private
 */
exports.addToFavorites = asyncHandler(async (req, res) => {
  const { propertyId } = req.body;

  if (!propertyId) {
    return res.status(400).json({
      success: false,
      message: 'Please provide property ID'
    });
  }

  // Check if property exists
  const property = await Property.findById(propertyId);

  if (!property) {
    return res.status(404).json({
      success: false,
      message: 'Property not found'
    });
  }

  // Check if already favorited
  const existingFavorite = await Favorite.findOne({
    user: req.user._id,
    property: propertyId
  });

  if (existingFavorite) {
    return res.status(400).json({
      success: false,
      message: 'Property already in favorites'
    });
  }

  // Create favorite
  const favorite = await Favorite.create({
    user: req.user._id,
    property: propertyId,
    notes: req.body.notes || ''
  });

  // Populate property details
  await favorite.populate({
    path: 'property',
    select: 'title propertyType rent location images status isPremium isFeatured owner',
    populate: {
      path: 'owner',
      select: 'name phone photoURL rating isVerified'
    }
  });

  res.status(201).json({
    success: true,
    message: 'Property added to favorites',
    favorite
  });
});

/**
 * @desc    Remove property from favorites
 * @route   DELETE /api/favorites/:id
 * @access  Private
 */
exports.removeFromFavorites = asyncHandler(async (req, res) => {
  const favorite = await Favorite.findById(req.params.id);

  if (!favorite) {
    return res.status(404).json({
      success: false,
      message: 'Favorite not found'
    });
  }

  // Check if user owns this favorite
  if (favorite.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to remove this favorite'
    });
  }

  await favorite.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Property removed from favorites'
  });
});

/**
 * @desc    Remove property from favorites by property ID
 * @route   DELETE /api/favorites/property/:propertyId
 * @access  Private
 */
exports.removeByPropertyId = asyncHandler(async (req, res) => {
  const favorite = await Favorite.findOne({
    user: req.user._id,
    property: req.params.propertyId
  });

  if (!favorite) {
    return res.status(404).json({
      success: false,
      message: 'Property not in favorites'
    });
  }

  await favorite.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Property removed from favorites'
  });
});

/**
 * @desc    Check if property is favorited by user
 * @route   GET /api/favorites/check/:propertyId
 * @access  Private
 */
exports.checkIfFavorited = asyncHandler(async (req, res) => {
  const isFavorited = await Favorite.isFavorited(req.user._id, req.params.propertyId);

  res.status(200).json({
    success: true,
    isFavorited
  });
});

/**
 * @desc    Update favorite notes
 * @route   PUT /api/favorites/:id/notes
 * @access  Private
 */
exports.updateNotes = asyncHandler(async (req, res) => {
  const { notes } = req.body;

  const favorite = await Favorite.findById(req.params.id);

  if (!favorite) {
    return res.status(404).json({
      success: false,
      message: 'Favorite not found'
    });
  }

  // Check if user owns this favorite
  if (favorite.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this favorite'
    });
  }

  favorite.notes = notes || '';
  await favorite.save();

  res.status(200).json({
    success: true,
    message: 'Notes updated successfully',
    favorite
  });
});

/**
 * @desc    Clear all favorites for user
 * @route   DELETE /api/favorites/clear
 * @access  Private
 */
exports.clearAllFavorites = asyncHandler(async (req, res) => {
  const result = await Favorite.deleteMany({ user: req.user._id });

  res.status(200).json({
    success: true,
    message: `Cleared ${result.deletedCount} favorites`,
    deletedCount: result.deletedCount
  });
});

