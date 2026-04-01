const { body, param, query, validationResult } = require('express-validator');

/**
 * Validation result checker middleware
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

/**
 * User Registration Validation Rules
 */
const signupValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  
  body('role')
    .optional()
    .isIn(['tenant', 'owner', 'both'])
    .withMessage('Role must be tenant, owner, or both'),
  
  validate
];

/**
 * User Login Validation Rules
 */
const signinValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  
  validate
];

/**
 * Property Creation Validation Rules
 */
const createPropertyValidation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ min: 5, max: 100 })
    .withMessage('Title must be between 5 and 100 characters'),
  
  body('propertyType')
    .notEmpty()
    .withMessage('Property type is required')
    .isIn(['room', 'flat', 'apartment', 'hostel', 'house'])
    .withMessage('Invalid property type'),
  
  body('rent')
    .notEmpty()
    .withMessage('Rent is required')
    .isNumeric()
    .withMessage('Rent must be a number')
    .isFloat({ min: 0 })
    .withMessage('Rent must be a positive number'),
  
  body('location.city')
    .trim()
    .notEmpty()
    .withMessage('City is required'),
  
  body('location.area')
    .trim()
    .notEmpty()
    .withMessage('Area is required'),
  
  validate
];

/**
 * MongoDB ObjectId Validation
 */
const objectIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid ID format'),

  validate
];

/**
 * MongoDB ObjectId Validation for :propertyId param
 */
const propertyIdValidation = [
  param('propertyId')
    .isMongoId()
    .withMessage('Invalid property ID format'),

  validate
];

module.exports = {
  validate,
  signupValidation,
  signinValidation,
  createPropertyValidation,
  objectIdValidation,
  propertyIdValidation
};

