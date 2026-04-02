const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email'
    ]
  },
  
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't return password in queries by default
  },
  
  // User Role
  role: {
    type: String,
    enum: {
      values: ['tenant', 'owner'],
      message: 'Role must be either tenant or owner'
    },
    default: 'tenant'
  },
  
  // Contact Information
  phone: {
    type: String,
    trim: true,
    // Allow phone with country code (+977...) or just 10 digits
    match: [/^(\+\d{1,3})?[0-9]{10,15}$/, 'Please provide a valid phone number']
  },
  
  // Profile Details
  photoURL: {
    type: String,
    default: null
  },
  
  dateOfBirth: {
    type: Date
  },
  
  gender: {
    type: String,
    enum: ['male', 'female', 'other']
  },
  
  occupation: {
    type: String,
    trim: true
  },
  
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters']
  },
  
  // Preferences (for tenants)
  preferences: {
    preferredCities: [{
      type: String
    }],
    budgetRange: {
      min: Number,
      max: Number
    },
    preferredPropertyTypes: [{
      type: String,
      enum: ['room', 'flat', 'apartment', 'hostel', 'house']
    }]
  },
  
  // Account Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  isVerified: {
    type: Boolean,
    default: false
  },
  
  // Statistics
  totalListings: {
    type: Number,
    default: 0
  },
  
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  
  totalRatings: {
    type: Number,
    default: 0
  },
  
  // Last Login
  lastLogin: {
    type: Date,
    default: Date.now
  },

  // Last Active (updated on socket disconnect)
  lastActive: {
    type: Date,
    default: Date.now
  },

  // Push notification tokens (supports multiple devices)
  fcmTokens: [{
    type: String
  }]

}, {
  timestamps: true // Adds createdAt and updatedAt
});

// ====================================
// INDEXES
// ====================================
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ phone: 1 });

// ====================================
// MIDDLEWARE - Hash password before saving
// ====================================
userSchema.pre('save', async function(next) {
  // Only hash password if it has been modified
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// ====================================
// METHODS
// ====================================

/**
 * Compare entered password with hashed password in database
 * @param {string} enteredPassword - Password entered by user
 * @returns {Promise<boolean>} True if passwords match
 */
userSchema.methods.comparePassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

/**
 * Get public profile (without sensitive data)
 * @returns {object} User profile object
 */
userSchema.methods.getPublicProfile = function() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    phone: this.phone,
    photoURL: this.photoURL,
    rating: this.rating,
    totalRatings: this.totalRatings,
    totalListings: this.totalListings,
    isVerified: this.isVerified,
    createdAt: this.createdAt
  };
};

/**
 * Update last login timestamp
 */
userSchema.methods.updateLastLogin = async function() {
  this.lastLogin = Date.now();
  await this.save({ validateBeforeSave: false });
};

// ====================================
// EXPORT MODEL
// ====================================
module.exports = mongoose.model('User', userSchema);

