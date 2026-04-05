const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  // Owner Reference
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Property must have an owner'],
    index: true
  },

  // Basic Information
  title: {
    type: String,
    required: [true, 'Please provide a title'],
    trim: true,
    minlength: [5, 'Title must be at least 5 characters'],
    maxlength: [100, 'Title cannot exceed 100 characters']
  },

  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },

  propertyType: {
    type: String,
    required: [true, 'Please specify property type'],
    enum: {
      values: ['room', 'flat', 'apartment', 'hostel', 'house'],
      message: 'Property type must be: room, flat, apartment, hostel, or house'
    },
    index: true
  },

  purpose: {
    type: String,
    enum: {
      values: ['living', 'business', 'both'],
      message: 'Purpose must be: living, business, or both'
    },
    default: 'living'
  },

  // Location Details
  location: {
    city: {
      type: String,
      required: [true, 'Please provide city'],
      trim: true,
      index: true
    },
    area: {
      type: String,
      trim: true,
      index: true,
      default: ''
    },
    fullAddress: {
      type: String,
      trim: true
    },
    landmark: {
      type: String,
      trim: true
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: '2dsphere'
    }
  },

  // Pricing Information
  rent: {
    type: Number,
    required: [true, 'Please provide monthly rent'],
    min: [0, 'Rent cannot be negative'],
    index: true
  },

  securityDeposit: {
    type: Number,
    min: [0, 'Security deposit cannot be negative'],
    default: 0
  },

  negotiable: {
    type: Boolean,
    default: false
  },

  electricityIncluded: {
    type: Boolean,
    default: false
  },

  waterIncluded: {
    type: Boolean,
    default: false
  },

  // Property Details
  numberOfRooms: {
    type: Number,
    min: [0, 'Number of rooms cannot be negative']
  },

  numberOfBathrooms: {
    type: Number,
    min: [0, 'Number of bathrooms cannot be negative']
  },

  numberOfFloors: {
    type: Number,
    min: [1, 'Number of floors must be at least 1']
  },

  floorNumber: {
    type: Number
  },

  size: {
    type: Number, // in square feet
    min: [0, 'Size cannot be negative']
  },

  facing: {
    type: String,
    enum: ['north', 'south', 'east', 'west', 'north-east', 'north-west', 'south-east', 'south-west']
  },

  // Amenities
  amenities: {
    water24x7: { type: Boolean, default: false },
    parking: { type: Boolean, default: false },
    bikeParking: { type: Boolean, default: false },
    carParking: { type: Boolean, default: false },
    wifi: { type: Boolean, default: false },
    furnished: { type: Boolean, default: false },
    semiFurnished: { type: Boolean, default: false },
    kitchen: { type: Boolean, default: false },
    attachedBathroom: { type: Boolean, default: false },
    balcony: { type: Boolean, default: false },
    garden: { type: Boolean, default: false },
    lift: { type: Boolean, default: false },
    security: { type: Boolean, default: false },
    cctv: { type: Boolean, default: false },
    generator: { type: Boolean, default: false },
    solarPanel: { type: Boolean, default: false }
  },

  // Tenant Preferences
  petFriendly: {
    type: Boolean,
    default: false
  },

  bachelorsAllowed: {
    type: Boolean,
    default: true
  },

  familyOnly: {
    type: Boolean,
    default: false
  },

  // Media
  images: {
    type: [String],
    required: [true, 'Please provide at least one image'],
    validate: {
      validator: function (arr) {
        return arr.length >= 1 && arr.length <= 10;
      },
      message: 'Property must have between 1 and 10 images'
    }
  },

  // Availability
  availableFrom: {
    type: Date,
    default: Date.now
  },

  minimumStayMonths: {
    type: Number,
    default: 1,
    min: [1, 'Minimum stay must be at least 1 month']
  },

  status: {
    type: String,
    enum: {
      values: ['available', 'rented'],
      message: 'Status must be either available or rented'
    },
    default: 'available',
    index: true
  },

  isActive: {
    type: Boolean,
    default: true,
    index: true
  },

  // Engagement Metrics
  views: {
    type: Number,
    default: 0,
    index: true
  },

  totalFavorites: {
    type: Number,
    default: 0
  },

  clicksOnCall: {
    type: Number,
    default: 0
  },

  // Verification
  isVerified: {
    type: Boolean,
    default: false
  },

  verifiedAt: {
    type: Date
  },

  // Premium Features
  isPremium: {
    type: Boolean,
    default: false,
    index: true
  },

  premiumExpiry: {
    type: Date
  },

  isFeatured: {
    type: Boolean,
    default: false,
    index: true
  },

  // Ranking
  rankScore: {
    type: Number,
    default: 0,
    index: true
  },

  // Listing Expiry
  expiresAt: {
    type: Date,
    default: function () {
      // Default expiry: 90 days from now
      return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    }
  }

}, {
  timestamps: true // Adds createdAt and updatedAt
});

// ====================================
// INDEXES
// ====================================
propertySchema.index({ 'location.city': 1, 'location.area': 1 });
// propertySchema.index({ 'location.coordinates': '2dsphere' }); // Defined in schema path
propertySchema.index({ rent: 1 });
propertySchema.index({ status: 1, isActive: 1 });
propertySchema.index({ createdAt: -1 });
propertySchema.index({ isPremium: 1, isFeatured: 1 });
propertySchema.index({ views: -1 });
propertySchema.index({ rankScore: -1 });

// Compound indexes for common query patterns
propertySchema.index({ isActive: 1, status: 1, 'location.city': 1, rankScore: -1 });
propertySchema.index({ isActive: 1, status: 1, rankScore: -1 });
propertySchema.index({ isActive: 1, status: 1, rent: 1 });

// Compound text index for search
propertySchema.index({
  title: 'text',
  description: 'text',
  'location.area': 'text',
  'location.city': 'text'
});

// ====================================
// VIRTUAL FIELDS
// ====================================

/**
 * Get monthly cost (rent + utilities if not included)
 */
propertySchema.virtual('monthlyCost').get(function () {
  let cost = this.rent;
  // You can add additional costs here if needed
  return cost;
});

/**
 * Check if property is featured or premium
 */
propertySchema.virtual('isHighlighted').get(function () {
  return this.isPremium || this.isFeatured;
});

// ====================================
// MIDDLEWARE
// ====================================

// NOTE: Auto-populate removed for performance. Use explicit .populate() in controllers.

/**
 * Check and update premium/featured status based on expiry,
 * and recompute rank score on every save.
 */
propertySchema.pre('save', function (next) {
  const now = new Date();

  // Check if premium has expired
  if (this.isPremium && this.premiumExpiry && this.premiumExpiry < now) {
    this.isPremium = false;
    this.isFeatured = false;
  }

  // Recompute rank score
  if (this.createdAt) {
    this.computeRankScore();
  }

  next();
});

// ====================================
// METHODS
// ====================================

/**
 * Compute rank score based on engagement metrics and recency.
 * Formula: views×1 + totalFavorites×3 + clicksOnCall×5 + recencyBoost + verifiedBoost
 * Recency boost: max 50 points, decays linearly over 30 days
 */
propertySchema.methods.computeRankScore = function () {
  const engagementScore =
    (this.views || 0) * 1 +
    (this.totalFavorites || 0) * 3 +
    (this.clicksOnCall || 0) * 5;

  // Recency: up to 50 points, decays over 30 days
  const ageInDays = (Date.now() - new Date(this.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  const recencyBoost = Math.max(0, 50 - (ageInDays * (50 / 30)));

  // Verified listings get a boost
  const verifiedBoost = this.isVerified ? 20 : 0;

  this.rankScore = Math.round(engagementScore + recencyBoost + verifiedBoost);
  return this.rankScore;
};

/**
 * Increment view count
 */
propertySchema.methods.incrementViews = async function () {
  this.views += 1;
  this.computeRankScore();
  await this.constructor.updateOne(
    { _id: this._id },
    { $inc: { views: 1 }, $set: { rankScore: this.rankScore } }
  );
};

/**
 * Increment call click count
 */
propertySchema.methods.incrementCallClicks = async function () {
  this.clicksOnCall += 1;
  this.computeRankScore();
  await this.constructor.updateOne(
    { _id: this._id },
    { $inc: { clicksOnCall: 1 }, $set: { rankScore: this.rankScore } }
  );
};

/**
 * Check if property is expired
 */
propertySchema.methods.isExpired = function () {
  return this.expiresAt < new Date();
};

/**
 * Get property summary (for lists)
 */
propertySchema.methods.getSummary = function () {
  return {
    id: this._id,
    title: this.title,
    propertyType: this.propertyType,
    rent: this.rent,
    location: {
      city: this.location.city,
      area: this.location.area
    },
    images: this.images,
    numberOfRooms: this.numberOfRooms,
    status: this.status,
    isPremium: this.isPremium,
    isFeatured: this.isFeatured,
    views: this.views,
    totalFavorites: this.totalFavorites,
    createdAt: this.createdAt
  };
};

// ====================================
// STATIC METHODS
// ====================================

/**
 * Get featured properties
 * @param {number} limit - Number of properties to return
 * @returns {Promise<Array>} Array of featured properties
 */
propertySchema.statics.getFeatured = function (limit = 10) {
  return this.find({
    isActive: true,
    status: 'available',
    isFeatured: true
  })
    .sort('-createdAt')
    .limit(limit);
};

/**
 * Get properties by city
 * @param {string} city - City name
 * @param {number} limit - Number of properties to return
 * @returns {Promise<Array>} Array of properties
 */
/**
 * Recalculate rank scores for all active properties
 */
propertySchema.statics.recalculateRankScores = async function () {
  const batchSize = 500;
  let updated = 0;
  let skip = 0;

  while (true) {
    const properties = await this.find({ isActive: true })
      .select('views totalFavorites clicksOnCall createdAt isVerified rankScore')
      .skip(skip)
      .limit(batchSize)
      .lean();

    if (properties.length === 0) break;

    const bulkOps = [];
    for (const prop of properties) {
      // Compute rank score inline (lean docs don't have methods)
      const engagementScore =
        (prop.views || 0) * 1 +
        (prop.totalFavorites || 0) * 3 +
        (prop.clicksOnCall || 0) * 5;
      const ageInDays = (Date.now() - new Date(prop.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      const recencyBoost = Math.max(0, 50 - (ageInDays * (50 / 30)));
      const verifiedBoost = prop.isVerified ? 20 : 0;
      const newScore = Math.round(engagementScore + recencyBoost + verifiedBoost);

      if (newScore !== prop.rankScore) {
        bulkOps.push({
          updateOne: {
            filter: { _id: prop._id },
            update: { $set: { rankScore: newScore } }
          }
        });
      }
    }

    if (bulkOps.length > 0) {
      const result = await this.bulkWrite(bulkOps);
      updated += result.modifiedCount;
    }

    skip += batchSize;
  }

  return updated;
};

propertySchema.statics.getByCity = function (city, limit = 20) {
  return this.find({
    'location.city': city,
    isActive: true,
    status: 'available'
  })
    .sort('-createdAt')
    .limit(limit);
};

// ====================================
// EXPORT MODEL
// ====================================
module.exports = mongoose.model('Property', propertySchema);

