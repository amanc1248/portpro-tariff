const express = require('express');
const router = express.Router();
const {
  googleSignIn,
  requestOtp,
  verifyOtp,
  signup,
  signin,
  getMe,
  updateProfile,
  updateRole,
  updatePassword,
  deleteAccount
} = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');
const {
  signupValidation,
  signinValidation
} = require('../utils/validators');

// ====================================
// PUBLIC ROUTES
// ====================================

/**
 * @route   POST /api/auth/google
 * @desc    Google Sign-In
 * @access  Public
 */
router.post('/google', googleSignIn);

/**
 * @route   POST /api/auth/request-otp
 * @desc    Request OTP (channels: whatsapp, viber)
 * @access  Public
 */
router.post('/request-otp', requestOtp);

/**
 * @route   POST /api/auth/verify-otp
 * @desc    Verify OTP and Login/Register
 * @access  Public
 */
router.post('/verify-otp', verifyOtp);

/**
 * @route   POST /api/auth/signup
 * @desc    Register new user
 * @access  Public
 */
router.post('/signup', signupValidation, signup);

/**
 * @route   POST /api/auth/signin
 * @desc    Login user
 * @access  Public
 */
router.post('/signin', signinValidation, signin);

// ====================================
// PROTECTED ROUTES (require authentication)
// ====================================

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', protect, getMe);

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile', protect, updateProfile);

/**
 * @route   PUT /api/auth/role
 * @desc    Update user role (tenant/owner/both)
 * @access  Private
 */
router.put('/role', protect, updateRole);

/**
 * @route   PUT /api/auth/password
 * @desc    Update password
 * @access  Private
 */
router.put('/password', protect, updatePassword);

/**
 * @route   DELETE /api/auth/account
 * @desc    Delete user account (soft delete)
 * @access  Private
 */
router.delete('/account', protect, deleteAccount);

module.exports = router;

