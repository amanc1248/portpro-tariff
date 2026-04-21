const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema({
  // User who favorited
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Favorite must belong to a user'],
    index: true
  },
  
  // Property that was favorited
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: [true, 'Favorite must reference a property'],
    index: true
  },
  
  // Optional notes by user
  notes: {
    type: String,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  }
  
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// ====================================
// INDEXES
// ====================================

// Compound unique index - prevent duplicate favorites
favoriteSchema.index({ user: 1, property: 1 }, { unique: true });

// Index for sorting by creation date
favoriteSchema.index({ createdAt: -1 });

// ====================================
// MIDDLEWARE
// ====================================

/**
 * Update property's totalFavorites count when favorite is added
 */
favoriteSchema.post('save', async function() {
  try {
    const Property = this.model('Property');
    const prop = await Property.findById(this.property).select(
      'views totalFavorites clicksOnCall createdAt isVerified rankScore'
    );
    if (prop) {
      prop.totalFavorites = (prop.totalFavorites || 0) + 1;
      prop.computeRankScore();
      await Property.updateOne(
        { _id: prop._id },
        { totalFavorites: prop.totalFavorites, rankScore: prop.rankScore }
      );
    }
  } catch (error) {
    console.error('Error updating property favorites count:', error);
  }
});

/**
 * Update property's totalFavorites count when favorite is removed
 */
favoriteSchema.post('findOneAndDelete', async function(doc) {
  if (doc) {
    try {
      const Property = mongoose.model('Property');
      const prop = await Property.findById(doc.property).select(
        'views totalFavorites clicksOnCall createdAt isVerified rankScore'
      );
      if (prop) {
        prop.totalFavorites = Math.max(0, (prop.totalFavorites || 0) - 1);
        prop.computeRankScore();
        await Property.updateOne(
          { _id: prop._id },
          { totalFavorites: prop.totalFavorites, rankScore: prop.rankScore }
        );
      }
    } catch (error) {
      console.error('Error updating property favorites count:', error);
    }
  }
});

// ====================================
// STATIC METHODS
// ====================================

/**
 * Check if a property is favorited by a user
 * @param {ObjectId} userId - User ID
 * @param {ObjectId} propertyId - Property ID
 * @returns {Promise<boolean>} True if favorited
 */
favoriteSchema.statics.isFavorited = async function(userId, propertyId) {
  const favorite = await this.findOne({
    user: userId,
    property: propertyId
  }).select('_id').lean();
  return !!favorite;
};

/**
 * Get user's favorite properties
 * @param {ObjectId} userId - User ID
 * @param {number} limit - Number of favorites to return
 * @returns {Promise<Array>} Array of favorite documents
 */
favoriteSchema.statics.getUserFavorites = function(userId, limit = 50) {
  return this.find({ user: userId })
    .sort('-createdAt')
    .limit(limit);
};

/**
 * Get count of favorites for a property
 * @param {ObjectId} propertyId - Property ID
 * @returns {Promise<number>} Count of favorites
 */
favoriteSchema.statics.getPropertyFavoritesCount = function(propertyId) {
  return this.countDocuments({ property: propertyId });
};

/**
 * Remove all favorites for a property (when property is deleted)
 * @param {ObjectId} propertyId - Property ID
 * @returns {Promise<object>} Delete result
 */
favoriteSchema.statics.removeAllForProperty = function(propertyId) {
  return this.deleteMany({ property: propertyId });
};

// ====================================
// METHODS
// ====================================

/**
 * Get formatted favorite data
 */
favoriteSchema.methods.getFormattedData = function() {
  return {
    id: this._id,
    property: this.property,
    notes: this.notes,
    favoritedAt: this.createdAt
  };
};

// ====================================
// EXPORT MODEL
// ====================================
module.exports = mongoose.model('Favorite', favoriteSchema);

