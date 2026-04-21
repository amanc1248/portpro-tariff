const { uploadToCloudinary, deleteFromCloudinary } = require('../config/cloudinary');

/**
 * Upload single image buffer to Cloudinary
 * @param {Buffer} buffer - Image buffer from multer
 * @param {string} folder - Cloudinary folder name
 * @returns {Promise<string>} Cloudinary URL
 */
exports.uploadImageBuffer = async (buffer, folder = 'gharbeti/properties') => {
  try {
    const result = await new Promise((resolve, reject) => {
      const stream = require('cloudinary').v2.uploader.upload_stream(
        {
          folder,
          resource_type: 'auto',
          transformation: [
            { width: 1200, height: 1200, crop: 'limit' },
            { quality: 'auto:good' },
            { fetch_format: 'auto' }
          ]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(buffer);
    });

    return result.secure_url;
  } catch (error) {
    console.error('Image upload error:', error);
    throw new Error('Failed to upload image');
  }
};

/**
 * Upload multiple image buffers to Cloudinary
 * @param {Array} files - Array of multer file objects
 * @param {string} folder - Cloudinary folder name
 * @returns {Promise<Array<string>>} Array of Cloudinary URLs
 */
exports.uploadMultipleImages = async (files, folder = 'gharbeti/properties') => {
  try {
    if (!files || files.length === 0) {
      throw new Error('No files provided for upload');
    }

    const uploadPromises = files.map(file =>
      exports.uploadImageBuffer(file.buffer, folder)
    );

    const urls = await Promise.all(uploadPromises);
    return urls;
  } catch (error) {
    console.error('Multiple images upload error:', error);
    throw new Error('Failed to upload images');
  }
};

/**
 * Delete image from Cloudinary using URL
 * @param {string} imageUrl - Cloudinary image URL
 * @returns {Promise<object>} Delete result
 */
exports.deleteImage = async (imageUrl) => {
  try {
    // Extract public ID from URL
    // Example URL: https://res.cloudinary.com/demo/image/upload/v1234567890/gharbeti/properties/abc123.jpg
    const parts = imageUrl.split('/');
    const filename = parts[parts.length - 1].split('.')[0]; // Get filename without extension
    const folder = parts.slice(-3, -1).join('/'); // Get folder path
    const publicId = `${folder}/${filename}`;

    const result = await deleteFromCloudinary(publicId);
    return result;
  } catch (error) {
    console.error('Image delete error:', error);
    throw new Error('Failed to delete image');
  }
};

/**
 * Delete multiple images from Cloudinary
 * @param {Array<string>} imageUrls - Array of Cloudinary image URLs
 * @returns {Promise<Array>} Array of delete results
 */
exports.deleteMultipleImages = async (imageUrls) => {
  try {
    if (!imageUrls || imageUrls.length === 0) {
      return [];
    }

    const deletePromises = imageUrls.map(url => exports.deleteImage(url));
    const results = await Promise.allSettled(deletePromises);
    
    return results;
  } catch (error) {
    console.error('Multiple images delete error:', error);
    throw new Error('Failed to delete images');
  }
};

/**
 * Replace old images with new ones
 * Uploads new images and deletes old ones
 * @param {Array} newFiles - Array of new multer file objects
 * @param {Array<string>} oldUrls - Array of old Cloudinary URLs to delete
 * @param {string} folder - Cloudinary folder name
 * @returns {Promise<Array<string>>} Array of new Cloudinary URLs
 */
exports.replaceImages = async (newFiles, oldUrls, folder = 'gharbeti/properties') => {
  try {
    // Upload new images first
    const newUrls = await exports.uploadMultipleImages(newFiles, folder);

    // Delete old images (don't wait for completion, do it in background)
    if (oldUrls && oldUrls.length > 0) {
      exports.deleteMultipleImages(oldUrls).catch(err => {
        console.error('Background image deletion failed:', err);
      });
    }

    return newUrls;
  } catch (error) {
    console.error('Replace images error:', error);
    throw new Error('Failed to replace images');
  }
};

