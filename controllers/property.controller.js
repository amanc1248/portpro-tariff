const Property = require('../models/Property');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { uploadMultipleImages, deleteMultipleImages } = require('../utils/imageUpload');

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @desc    Get all properties with filters and pagination
 * @route   GET /api/properties
 * @access  Public
 */
exports.getProperties = asyncHandler(async (req, res) => {
  const {
    search,
    city,
    area,
    minRent,
    maxRent,
    propertyType,
    amenities,
    purpose,
    status,
    page = 1,
    limit = 20,
    sort = '-rankScore'
  } = req.query;

  // Validate and cap pagination
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const skip = (safePage - 1) * safeLimit;

  // Validate sort parameter
  const allowedSortFields = ['-rankScore', '-createdAt', 'createdAt', 'rent', '-rent', '-views', '-totalFavorites'];
  const safeSort = allowedSortFields.includes(sort) ? sort : '-rankScore';

  // Build filter object
  const filter = { isActive: true };

  // Filter out expired listings
  filter.expiresAt = { $gt: new Date() };

  // Only show available properties by default
  if (status) {
    filter.status = status;
  } else {
    filter.status = 'available';
  }

  // Text search (title, description, location)
  if (search && search.trim()) {
    filter.$text = { $search: search.trim() };
  }

  // Location filters
  if (city) filter['location.city'] = city;
  if (area) filter['location.area'] = { $regex: `^${escapeRegex(area)}`, $options: 'i' };

  // Geospatial Search (Radius in km)
  const { lat, lng, radius } = req.query;
  if (lat && lng) {
    const radiusInKm = parseFloat(radius) || 5; // Default 5km
    const radiusInMeters = radiusInKm * 1000;

    filter['location.coordinates'] = {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [parseFloat(lng), parseFloat(lat)]
        },
        $maxDistance: radiusInMeters
      }
    };
  }

  // Price range filter
  if (minRent || maxRent) {
    filter.rent = {};
    if (minRent) filter.rent.$gte = parseInt(minRent);
    if (maxRent) filter.rent.$lte = parseInt(maxRent);
  }

  // Property type filter
  if (propertyType) {
    if (Array.isArray(propertyType)) {
      filter.propertyType = { $in: propertyType };
    } else {
      filter.propertyType = propertyType;
    }
  }

  // Validate amenities against allowed values
  if (amenities) {
    const validAmenities = [
      'water24x7', 'parking', 'bikeParking', 'carParking', 'wifi', 'furnished',
      'semiFurnished', 'kitchen', 'attachedBathroom', 'balcony', 'garden',
      'lift', 'security', 'cctv', 'generator', 'solarPanel'
    ];
    const amenitiesArray = Array.isArray(amenities) ? amenities : amenities.split(',');
    amenitiesArray.forEach(amenity => {
      if (validAmenities.includes(amenity)) {
        filter[`amenities.${amenity}`] = true;
      }
    });
  }

  // Purpose filter
  if (purpose) {
    filter.purpose = purpose;
  }

  // Build query
  let query = Property.find(filter);

  // If text search, sort by relevance score
  if (search && search.trim()) {
    query = query.select({ score: { $meta: 'textScore' } }).sort({ score: { $meta: 'textScore' } });
  } else if (lat && lng) {
    // If geospatial search, do NOT apply explicit sort as $near sorts by distance
    // and MongoDB throws error if we try to sort on top of $near
  } else {
    query = query.sort(safeSort);
  }

  // Execute query with pagination
  const properties = await query
    .skip(skip)
    .limit(safeLimit)
    .populate('owner', 'name phone photoURL rating totalRatings isVerified');

  // Create a separate filter for counting because $near is not supported in countDocuments
  // $near implies sorting, which countDocuments doesn't support
  const countFilter = { ...filter };

  if (lat && lng) {
    const radiusInKm = parseFloat(radius) || 5;
    const radiusInRadians = radiusInKm / 6378.1; // Earth radius in km

    // Replace $near with $geoWithin + $centerSphere for counting
    countFilter['location.coordinates'] = {
      $geoWithin: {
        $centerSphere: [[parseFloat(lng), parseFloat(lat)], radiusInRadians]
      }
    };
  }

  const total = await Property.countDocuments(countFilter);

  res.status(200).json({
    success: true,
    count: properties.length,
    total,
    properties,
    pagination: {
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
      hasMore: safePage * safeLimit < total
    }
  });
});

/**
 * @desc    Get featured properties
 * @route   GET /api/properties/featured
 * @access  Public
 */
exports.getFeaturedProperties = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  const properties = await Property.find({
    isActive: true,
    status: 'available',
    isFeatured: true,
    expiresAt: { $gt: new Date() }
  })
    .sort('-createdAt')
    .limit(limit)
    .populate('owner', 'name phone photoURL rating totalRatings isVerified');

  res.status(200).json({
    success: true,
    count: properties.length,
    properties
  });
});

/**
 * @desc    Get explore data — properties grouped by city
 * @route   GET /api/properties/explore
 * @access  Public
 * @query   propertyType, minRent, maxRent, sort, amenities, perCity
 */
exports.getExploreData = asyncHandler(async (req, res) => {
  const { propertyType, amenities } = req.query;
  const perCity = Math.min(Math.max(parseInt(req.query.perCity) || 8, 1), 100);
  const minRent = parseInt(req.query.minRent);
  const maxRent = parseInt(req.query.maxRent);
  const allowedExploreSortFields = ['-rankScore', '-createdAt', 'createdAt', 'rent', '-rent', '-views', '-totalFavorites'];
  const sortParam = allowedExploreSortFields.includes(req.query.sort) ? req.query.sort : '-rankScore';

  const baseFilter = {
    isActive: true,
    status: 'available',
    expiresAt: { $gt: new Date() },
  };

  if (propertyType) {
    baseFilter.propertyType = Array.isArray(propertyType)
      ? { $in: propertyType }
      : propertyType;
  }

  // Price filter
  if (!isNaN(minRent) || !isNaN(maxRent)) {
    baseFilter.rent = {};
    if (!isNaN(minRent) && minRent > 0) baseFilter.rent.$gte = minRent;
    if (!isNaN(maxRent) && maxRent < 100000) baseFilter.rent.$lte = maxRent;
    if (Object.keys(baseFilter.rent).length === 0) delete baseFilter.rent;
  }

  // Validate amenities against allowed values
  if (amenities) {
    const validAmenities = [
      'water24x7', 'parking', 'bikeParking', 'carParking', 'wifi', 'furnished',
      'semiFurnished', 'kitchen', 'attachedBathroom', 'balcony', 'garden',
      'lift', 'security', 'cctv', 'generator', 'solarPanel'
    ];
    const amenityList = Array.isArray(amenities) ? amenities : [amenities];
    for (const a of amenityList) {
      if (validAmenities.includes(a)) {
        baseFilter[`amenities.${a}`] = true;
      }
    }
  }

  // Get featured/premium properties
  const featured = await Property.find({
    ...baseFilter,
    $or: [{ isFeatured: true }, { isPremium: true }]
  })
    .sort(sortParam)
    .limit(6)
    .populate('owner', 'name phone photoURL rating totalRatings isVerified');

  // Get distinct cities that have properties
  const cityCounts = await Property.aggregate([
    { $match: baseFilter },
    {
      $group: {
        _id: '$location.city',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);

  // For each city, get top N properties (in parallel)
  const cities = await Promise.all(
    cityCounts
      .filter(({ _id }) => _id)
      .map(async ({ _id: cityName, count }) => {
        const properties = await Property.find({
          ...baseFilter,
          'location.city': cityName
        })
          .sort(sortParam)
          .limit(perCity)
          .populate('owner', 'name phone photoURL rating totalRatings isVerified');
        return { city: cityName, count, properties };
      })
  );

  res.status(200).json({
    success: true,
    featured,
    cities
  });
});

/**
 * @desc    Get single property by ID
 * @route   GET /api/properties/:id
 * @access  Public
 */
exports.getProperty = asyncHandler(async (req, res) => {
  const property = await Property.findById(req.params.id)
    .populate('owner', 'name phone email photoURL rating totalRatings isVerified createdAt');

  if (!property) {
    return res.status(404).json({
      success: false,
      message: 'Property not found'
    });
  }

  res.status(200).json({
    success: true,
    property
  });
});

/**
 * @desc    Create new property
 * @route   POST /api/properties
 * @access  Private (Owner/Both)
 */
exports.createProperty = asyncHandler(async (req, res) => {
  // Check if user can create property (must be owner or both)
  if (req.user.role === 'tenant') {
    return res.status(403).json({
      success: false,
      message: 'Only property owners can create listings. Please update your role in profile.'
    });
  }

  // Upload images if provided
  let imageUrls = [];
  if (req.files && req.files.length > 0) {
    imageUrls = await uploadMultipleImages(req.files, 'gharbeti/properties');
  } else if (req.body.images) {
    // If images are provided as URLs (for testing)
    imageUrls = Array.isArray(req.body.images) ? req.body.images : [req.body.images];
  } else {
    return res.status(400).json({
      success: false,
      message: 'Please provide at least one property image'
    });
  }

  // Parse location if it's a string
  let location = req.body.location;
  if (typeof location === 'string') {
    try {
      location = JSON.parse(location);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Invalid location format'
      });
    }
  }

  // Convert coordinates to [lng, lat] array if provided as object or array of objects
  if (location && location.coordinates) {
    let coords = location.coordinates;

    // Handle case where coordinates is an array of objects [{latitude, longitude}]
    if (Array.isArray(coords) && coords.length > 0 && typeof coords[0] === 'object') {
      coords = coords[0];
    }

    // Convert {latitude, longitude} to [lng, lat]
    if (!Array.isArray(coords) && coords.latitude && coords.longitude) {
      location.coordinates = [parseFloat(coords.longitude), parseFloat(coords.latitude)];
    }
  }

  // Parse amenities if it's a string
  let amenities = req.body.amenities;
  if (typeof amenities === 'string') {
    try {
      amenities = JSON.parse(amenities);
    } catch (e) {
      amenities = {};
    }
  }

  // Validate coordinates are within valid ranges
  if (location && location.coordinates && Array.isArray(location.coordinates)) {
    const [lng, lat] = location.coordinates;
    if (isNaN(lng) || isNaN(lat) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coordinates. Latitude must be -90 to 90, Longitude must be -180 to 180.'
      });
    }
  }

  // Whitelist allowed fields
  const allowed = {};
  const allowedFields = [
    'title', 'description', 'propertyType', 'purpose',
    'rent', 'securityDeposit', 'negotiable', 'electricityIncluded', 'waterIncluded',
    'numberOfRooms', 'numberOfBathrooms', 'numberOfFloors', 'floorNumber', 'size', 'facing',
    'petFriendly', 'bachelorsAllowed', 'familyOnly',
    'availableFrom', 'minimumStayMonths'
  ];
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) allowed[field] = req.body[field];
  }

  // Create property
  const property = await Property.create({
    ...allowed,
    location,
    amenities,
    images: imageUrls,
    owner: req.user._id
  });

  // Update user's total listings count
  await User.findByIdAndUpdate(req.user._id, {
    $inc: { totalListings: 1 }
  });

  res.status(201).json({
    success: true,
    message: 'Property created successfully',
    property
  });
});

/**
 * @desc    Update property
 * @route   PUT /api/properties/:id
 * @access  Private (Owner of property)
 */
exports.updateProperty = asyncHandler(async (req, res) => {
  let property = await Property.findById(req.params.id);

  if (!property) {
    return res.status(404).json({
      success: false,
      message: 'Property not found'
    });
  }

  // Check if user owns this property
  const ownerId = property.owner._id || property.owner;
  if (ownerId.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this property'
    });
  }

  // Handle image updates if new images are provided
  let imageUrls = property.images;
  if (req.files && req.files.length > 0) {
    // Upload new images
    const newImageUrls = await uploadMultipleImages(req.files, 'gharbeti/properties');

    // Delete old images (in background)
    deleteMultipleImages(property.images).catch(err => {
      console.error('Failed to delete old images:', err);
    });

    imageUrls = newImageUrls;
  } else if (req.body.images) {
    // If images are provided as URLs
    imageUrls = Array.isArray(req.body.images) ? req.body.images : [req.body.images];
  }

  // Parse location if it's a string
  let location = req.body.location;
  if (typeof location === 'string') {
    try {
      location = JSON.parse(location);
    } catch (e) {
      location = property.location;
    }
  }

  // Convert coordinates to [lng, lat] array if provided as object or array of objects
  if (location && location.coordinates) {
    let coords = location.coordinates;

    // Handle case where coordinates is an array of objects [{latitude, longitude}]
    if (Array.isArray(coords) && coords.length > 0 && typeof coords[0] === 'object') {
      coords = coords[0];
    }

    // Convert {latitude, longitude} to [lng, lat]
    if (!Array.isArray(coords) && coords.latitude && coords.longitude) {
      location.coordinates = [parseFloat(coords.longitude), parseFloat(coords.latitude)];
    }
  }

  // Parse amenities if it's a string
  let amenities = req.body.amenities;
  if (typeof amenities === 'string') {
    try {
      amenities = JSON.parse(amenities);
    } catch (e) {
      amenities = property.amenities;
    }
  }

  // Validate coordinates are within valid ranges
  if (location && location.coordinates && Array.isArray(location.coordinates)) {
    const [lng, lat] = location.coordinates;
    if (isNaN(lng) || isNaN(lat) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coordinates. Latitude must be -90 to 90, Longitude must be -180 to 180.'
      });
    }
  }

  // Whitelist allowed fields
  const allowed = {};
  const allowedFields = [
    'title', 'description', 'propertyType', 'purpose',
    'rent', 'securityDeposit', 'negotiable', 'electricityIncluded', 'waterIncluded',
    'numberOfRooms', 'numberOfBathrooms', 'numberOfFloors', 'floorNumber', 'size', 'facing',
    'petFriendly', 'bachelorsAllowed', 'familyOnly',
    'availableFrom', 'minimumStayMonths', 'status'
  ];
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) allowed[field] = req.body[field];
  }

  // Update property
  property = await Property.findByIdAndUpdate(
    req.params.id,
    {
      ...allowed,
      location: location || property.location,
      amenities: amenities || property.amenities,
      images: imageUrls
    },
    {
      new: true,
      runValidators: true
    }
  );

  res.status(200).json({
    success: true,
    message: 'Property updated successfully',
    property
  });
});

/**
 * @desc    Delete property
 * @route   DELETE /api/properties/:id
 * @access  Private (Owner of property)
 */
exports.deleteProperty = asyncHandler(async (req, res) => {
  const property = await Property.findById(req.params.id);

  if (!property) {
    return res.status(404).json({
      success: false,
      message: 'Property not found'
    });
  }

  // Check if user owns this property
  if (property.owner._id.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to delete this property'
    });
  }

  // Delete images from Cloudinary (in background)
  deleteMultipleImages(property.images).catch(err => {
    console.error('Failed to delete images:', err);
  });

  // Delete property
  await property.deleteOne();

  // Update user's total listings count
  await User.findByIdAndUpdate(req.user._id, {
    $inc: { totalListings: -1 }
  });

  res.status(200).json({
    success: true,
    message: 'Property deleted successfully'
  });
});

/**
 * @desc    Get user's own properties
 * @route   GET /api/properties/my-listings
 * @access  Private (Owner/Both)
 */
exports.getMyListings = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20, sort = '-createdAt' } = req.query;

  // Validate and cap pagination
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const skip = (safePage - 1) * safeLimit;

  // Validate sort parameter
  const allowedSortFields = ['-rankScore', '-createdAt', 'createdAt', 'rent', '-rent', '-views', '-totalFavorites'];
  const safeSort = allowedSortFields.includes(sort) ? sort : '-createdAt';

  const filter = { owner: req.user._id };

  if (status) {
    filter.status = status;
  }

  const properties = await Property.find(filter)
    .sort(safeSort)
    .skip(skip)
    .limit(safeLimit);

  const total = await Property.countDocuments(filter);

  res.status(200).json({
    success: true,
    count: properties.length,
    total,
    properties,
    pagination: {
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
      hasMore: safePage * safeLimit < total
    }
  });
});

/**
 * @desc    Update property status (available/rented)
 * @route   PATCH /api/properties/:id/status
 * @access  Private (Owner of property)
 */
exports.updatePropertyStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!status || !['available', 'rented'].includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid status (available or rented)'
    });
  }

  const property = await Property.findById(req.params.id);

  if (!property) {
    return res.status(404).json({
      success: false,
      message: 'Property not found'
    });
  }

  // Check if user owns this property
  if (property.owner._id.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this property'
    });
  }

  property.status = status;
  await property.save();

  res.status(200).json({
    success: true,
    message: `Property marked as ${status}`,
    property
  });
});

/**
 * @desc    Increment property views
 * @route   POST /api/properties/:id/view
 * @access  Public
 */
exports.incrementViews = asyncHandler(async (req, res) => {
  const property = await Property.findById(req.params.id);

  if (!property) {
    return res.status(404).json({
      success: false,
      message: 'Property not found'
    });
  }

  await property.incrementViews();

  res.status(200).json({
    success: true,
    message: 'View counted',
    views: property.views
  });
});

/**
 * @desc    Increment property call clicks
 * @route   POST /api/properties/:id/call
 * @access  Public
 */
exports.incrementCallClicks = asyncHandler(async (req, res) => {
  const property = await Property.findById(req.params.id);

  if (!property) {
    return res.status(404).json({
      success: false,
      message: 'Property not found'
    });
  }

  await property.incrementCallClicks();

  res.status(200).json({
    success: true,
    message: 'Call click counted',
    clicksOnCall: property.clicksOnCall
  });
});

