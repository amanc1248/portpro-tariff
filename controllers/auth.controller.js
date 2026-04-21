const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Property = require('../models/Property');
const asyncHandler = require('../utils/asyncHandler');

const googleClient = new OAuth2Client();

/**
 * Generate JWT Token
 * @param {string} id - User ID
 * @returns {string} JWT token
 */
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '1d'
  });
};

const generateRefreshToken = (id) => {
  return jwt.sign({ id, type: 'refresh' }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

const otpService = require('../services/otp.service');

/**
 * @desc    Google Sign-In
 * @route   POST /api/auth/google
 * @access  Public
 */
exports.googleSignIn = asyncHandler(async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({
      success: false,
      message: 'ID token is required'
    });
  }

  // Verify the Google ID token
  const googleClientIds = (process.env.GOOGLE_CLIENT_IDS || '').split(',').map(id => id.trim()).filter(Boolean);

  if (googleClientIds.length === 0) {
    return res.status(500).json({
      success: false,
      message: 'Google Sign-In is not configured'
    });
  }

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: googleClientIds
  });

  const payload = ticket.getPayload();
  if (!payload.email_verified) {
    return res.status(400).json({
      success: false,
      message: 'Google email is not verified'
    });
  }
  const { email, name, picture, sub: googleId } = payload;

  // Check if user already exists
  let user = await User.findOne({ email });
  let isNewUser = false;

  if (user) {
    // Existing user - check if active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support.'
      });
    }

    // Update photo if not set
    if (!user.photoURL && picture) {
      user.photoURL = picture;
      await user.save({ validateBeforeSave: false });
    }

    await user.updateLastLogin();
  } else {
    // New user - create account
    isNewUser = true;
    user = await User.create({
      name: name || 'Google User',
      email,
      password: `google_${googleId}_${Date.now()}`,
      photoURL: picture || null,
      isVerified: true,
      role: 'tenant'
    });

    await user.updateLastLogin();
  }

  const token = generateToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  res.status(isNewUser ? 201 : 200).json({
    success: true,
    message: isNewUser ? 'Account created successfully' : 'Login successful',
    isNewUser,
    token,
    refreshToken,
    user: user.getPublicProfile()
  });
});

/**
 * @desc    Request OTP
 * @route   POST /api/auth/request-otp
 * @access  Public
 */
exports.requestOtp = asyncHandler(async (req, res) => {
  const { phone, channel } = req.body;

  if (!phone) {
    return res.status(400).json({
      success: false,
      message: 'Phone number is required'
    });
  }

  // Use 'whatsapp' as default channel if not provided or invalid
  const validChannel = ['whatsapp', 'viber'].includes(channel) ? channel : 'whatsapp';

  const sent = await otpService.sendOtp(phone, validChannel);

  if (sent) {
    res.status(200).json({
      success: true,
      message: `OTP sent via ${validChannel}`,
      channel: validChannel
    });
  } else {
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP'
    });
  }
});

/**
 * @desc    Verify OTP and Login/Register
 * @route   POST /api/auth/verify-otp
 * @access  Public
 */
exports.verifyOtp = asyncHandler(async (req, res) => {
  const { phone, otp, name, role } = req.body;

  if (!phone || !otp) {
    return res.status(400).json({
      success: false,
      message: 'Phone number and OTP are required'
    });
  }

  // 1. Verify OTP
  const isValid = await otpService.verifyOtp(phone, otp);

  if (!isValid) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or expired OTP'
    });
  }

  // 2. Verified! Proceed to Login/Register logic (Similar to old phoneAuth)
  if (process.env.NODE_ENV === 'development') {
    console.log(`✅ OTP Verified for ${phone}. Proceeding to auth.`);
  }

  // Check if user exists with this phone number
  let user = await User.findOne({ phone });

  if (user) {
    // User exists - LOGIN
    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support.'
      });
    }

    await user.updateLastLogin();
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      isNewUser: false,
      token,
      refreshToken,
      user: user.getPublicProfile()
    });
  } else {
    // User doesn't exist - REGISTER (or partial register if name missing)

    // If name is not provided during verification, we might want to return isNewUser: true
    // so frontend can show "Complete Profile" screen.
    // However, the current frontend flow asks for name/role BEFORE OTP in some flows?
    // Let's assume if name is missing we create a partial user OR return a specific flag.

    // Strategy: Create the user even if name is missing (using phone as name placeholder) 
    // AND return isNewUser: true. The frontend should then redirect to "Complete Profile".

    // Generate email from phone
    const email = `${phone.replace(/\+/g, '')}@gharbeti.app`;
    const password = crypto.randomBytes(32).toString('hex');

    user = await User.create({
      name: name || `User ${phone.slice(-4)}`, // Placeholder name
      email,
      password,
      phone,
      role: role || 'tenant',
      isVerified: true // Phone Verified!
    });

    await user.updateLastLogin();
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    return res.status(201).json({
      success: true,
      message: 'Account verified and created',
      isNewUser: true,
      token,
      refreshToken,
      user: user.getPublicProfile()
    });
  }
});

// Keep old phoneAuth for backward compatibility but mark deprecated?
// Or just comment it out. Let's keep it for now but the new implementation 
// is handled above. Note: I am replacing the OLD phoneAuth export with these NEW ones.
// If you want to keep 'phoneAuth' as a function name, I should preserve it.
// But the plan says "Deprecate/Remove phoneAuth". So I will replace the export block.


/**
 * @desc    Register new user
 * @route   POST /api/auth/signup
 * @access  Public
 */
exports.signup = asyncHandler(async (req, res) => {
  const { name, email, password, role, phone } = req.body;

  if (process.env.NODE_ENV === 'development') {
    console.log('📱 Signup request received');
  }

  // Password strength validation
  if (password && !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}/.test(password)) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 8 characters with uppercase, lowercase, and a number'
    });
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email });

  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: 'User with this email already exists'
    });
  }

  // Create user with phone
  const userData = {
    name,
    email,
    password,
    role: role || 'tenant'
  };

  // Add phone if provided
  if (phone) {
    userData.phone = phone;
  }

  const user = await User.create(userData);
  if (process.env.NODE_ENV === 'development') {
    console.log('📱 User created successfully');
  }

  // Generate tokens
  const token = generateToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  // Update last login
  await user.updateLastLogin();

  res.status(201).json({
    success: true,
    message: 'Account created successfully',
    token,
    refreshToken,
    user: user.getPublicProfile()
  });
});

/**
 * @desc    Login user
 * @route   POST /api/auth/signin
 * @access  Public
 */
exports.signin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Check if email and password are provided
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide email and password'
    });
  }

  // Find user by email (include password field)
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password'
    });
  }

  // Check if account is active
  if (!user.isActive) {
    return res.status(403).json({
      success: false,
      message: 'Your account has been deactivated. Please contact support.'
    });
  }

  // Compare password
  const isPasswordMatch = await user.comparePassword(password);

  if (!isPasswordMatch) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password'
    });
  }

  // Generate tokens
  const token = generateToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  // Update last login
  await user.updateLastLogin();

  res.status(200).json({
    success: true,
    message: 'Login successful',
    token,
    refreshToken,
    user: user.getPublicProfile()
  });
});

/**
 * @desc    Get current logged in user
 * @route   GET /api/auth/me
 * @access  Private
 */
exports.getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  res.status(200).json({
    success: true,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      photoURL: user.photoURL,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      occupation: user.occupation,
      bio: user.bio,
      preferences: user.preferences,
      isActive: user.isActive,
      isVerified: user.isVerified,
      totalListings: user.totalListings,
      rating: user.rating,
      totalRatings: user.totalRatings,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt
    }
  });
});

/**
 * @desc    Update user profile
 * @route   PUT /api/auth/profile
 * @access  Private
 */
exports.updateProfile = asyncHandler(async (req, res) => {
  const {
    name,
    phone,
    photoURL,
    dateOfBirth,
    gender,
    occupation,
    bio,
    preferences
  } = req.body;

  // Build update object (only include fields that were provided)
  const updateData = {};
  if (name) updateData.name = name;
  if (phone) updateData.phone = phone;
  if (photoURL) {
    try {
      const url = new URL(photoURL);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return res.status(400).json({ success: false, message: 'Invalid photo URL' });
      }
      updateData.photoURL = photoURL;
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid photo URL' });
    }
  }
  if (dateOfBirth) updateData.dateOfBirth = dateOfBirth;
  if (gender) updateData.gender = gender;
  if (occupation) updateData.occupation = occupation;
  if (bio) updateData.bio = bio;
  if (preferences) updateData.preferences = preferences;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    updateData,
    {
      new: true,
      runValidators: true
    }
  );

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      photoURL: user.photoURL,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      occupation: user.occupation,
      bio: user.bio,
      preferences: user.preferences
    }
  });
});

/**
 * @desc    Update user role
 * @route   PUT /api/auth/role
 * @access  Private
 */
exports.updateRole = asyncHandler(async (req, res) => {
  const { role } = req.body;

  if (!role || !['tenant', 'owner', 'both'].includes(role)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid role (tenant, owner, or both)'
    });
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { role },
    {
      new: true,
      runValidators: true
    }
  );

  res.status(200).json({
    success: true,
    message: 'Role updated successfully',
    user: user.getPublicProfile()
  });
});

/**
 * @desc    Update password
 * @route   PUT /api/auth/password
 * @access  Private
 */
exports.updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Please provide current password and new password'
    });
  }

  // Get user with password
  const user = await User.findById(req.user._id).select('+password');

  // Check current password
  const isMatch = await user.comparePassword(currentPassword);

  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: 'Current password is incorrect'
    });
  }

  // Update password
  user.password = newPassword;
  await user.save();

  // Generate new tokens
  const token = generateToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  res.status(200).json({
    success: true,
    message: 'Password updated successfully',
    token,
    refreshToken
  });
});

/**
 * @desc    Delete user account
 * @route   DELETE /api/auth/account
 * @access  Private
 */
exports.deleteAccount = asyncHandler(async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide your password to delete account'
    });
  }

  // Get user with password
  const user = await User.findById(req.user._id).select('+password');

  // Verify password
  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: 'Incorrect password'
    });
  }

  // Soft delete - deactivate account instead of permanently deleting
  user.isActive = false;
  await user.save();

  // Deactivate all user's properties
  await Property.updateMany(
    { owner: req.user._id },
    { isActive: false, status: 'booked' }
  );

  res.status(200).json({
    success: true,
    message: 'Account deactivated successfully'
  });
});

/**
 * @desc    Register or remove FCM token
 * @route   PUT /api/auth/fcm-token
 * @access  Private
 */
exports.updateFcmToken = asyncHandler(async (req, res) => {
  const { fcmToken, action } = req.body;

  if (!fcmToken) {
    return res.status(400).json({
      success: false,
      message: 'FCM token is required'
    });
  }

  const user = await User.findById(req.user._id);

  if (action === 'remove') {
    user.fcmTokens = (user.fcmTokens || []).filter(t => t !== fcmToken);
  } else {
    // Remove this token from any other user (device switched accounts)
    await User.updateMany(
      { _id: { $ne: user._id }, fcmTokens: fcmToken },
      { $pull: { fcmTokens: fcmToken } }
    );
    // Register — add if not already present
    if (!user.fcmTokens) user.fcmTokens = [];
    if (!user.fcmTokens.includes(fcmToken)) {
      user.fcmTokens.push(fcmToken);
    }
    // Keep max 5 tokens per user (multiple devices)
    if (user.fcmTokens.length > 5) {
      user.fcmTokens = user.fcmTokens.slice(-5);
    }
  }

  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    success: true,
    message: action === 'remove' ? 'Token removed' : 'Token registered'
  });
});

/**
 * @desc    Refresh access token using refresh token
 * @route   POST /api/auth/refresh-token
 * @access  Public
 */
exports.refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      message: 'Refresh token is required'
    });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token type'
      });
    }

    const user = await User.findById(decoded.id);

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User not found or deactivated'
      });
    }

    const newToken = generateToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    res.status(200).json({
      success: true,
      token: newToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired refresh token. Please login again.'
    });
  }
});

