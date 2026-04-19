const multer = require('multer');
const path = require('path');

// ====================================
// MULTER CONFIGURATION
// ====================================

// Storage configuration - store in memory as buffer
const storage = multer.memoryStorage();

// File filter - only allow images
const fileFilter = (req, file, cb) => {
  // Allowed file extensions
  const allowedExtensions = /jpeg|jpg|png|webp/;
  
  // Check extension
  const extname = allowedExtensions.test(
    path.extname(file.originalname).toLowerCase()
  );
  
  // Check mime type
  const mimetype = allowedExtensions.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpeg, jpg, png, webp)'));
  }
};

// ====================================
// MULTER INSTANCES
// ====================================

/**
 * Single image upload
 * Usage: upload.single('image')
 */
exports.uploadSingle = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max file size
  },
  fileFilter: fileFilter
}).single('image');

/**
 * Multiple images upload (up to 10)
 * Usage: upload.array('images', 10)
 */
exports.uploadMultiple = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max per file
    files: 10 // Max 10 files
  },
  fileFilter: fileFilter
}).array('images', 10);

/**
 * Property images upload (1-10 images)
 * Usage: uploadPropertyImages
 */
exports.uploadPropertyImages = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max per file
    files: 10 // Max 10 files for property
  },
  fileFilter: fileFilter
}).array('images', 10);

// ====================================
// ERROR HANDLING MIDDLEWARE
// ====================================

/**
 * Handle multer errors
 */
exports.handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Multer-specific errors
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size is too large. Maximum size is 5MB per file.'
      });
    }
    
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum is 10 files.'
      });
    }
    
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected field name in file upload.'
      });
    }

    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`
    });
  } else if (err) {
    // Other errors (like file type errors)
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }

  next();
};

