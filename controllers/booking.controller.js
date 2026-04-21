const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const BookingRequest = require('../models/BookingRequest');
const Property = require('../models/Property');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { getIo } = require('../services/socket.service');
const { sendPushToUser } = require('../services/fcm.service');

// Helper: send a structured system message into a conversation (fire-and-forget)
async function sendSystemMessage(conversationId, senderId, content, { systemMessageType, systemMessageMeta } = {}) {
  if (!conversationId) return;
  try {
    const msgData = {
      conversationId,
      sender: senderId,
      content,
      isSystemMessage: true,
      readBy: [senderId]
    };
    if (systemMessageType) {
      msgData.systemMessageType = systemMessageType;
      msgData.systemMessageMeta = systemMessageMeta || {};
    }

    const message = await Message.create(msgData);

    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: {
        content,
        sender: senderId,
        createdAt: message.createdAt
      }
    });

    // Emit to conversation room so both parties see it in real time
    try {
      const io = getIo();
      io.to(conversationId.toString()).emit('receive_message', {
        ...message.toObject(),
        conversationId: conversationId.toString()
      });
    } catch (_) {}
  } catch (err) {
    console.error('System message error:', err.message);
  }
}

// Helper: emit booking status change to a conversation room
function emitBookingEvent(conversationId, eventName, data) {
  try {
    const io = getIo();
    if (conversationId) {
      io.to(conversationId.toString()).emit(eventName, data);
    }
  } catch (_) {}
}

/**
 * @desc    Create a booking request for a property
 * @route   POST /api/bookings/request
 * @access  Private (tenant)
 */
exports.createBookingRequest = asyncHandler(async (req, res) => {
  const { propertyId, message, conversationId } = req.body;

  if (!propertyId) {
    return res.status(400).json({
      success: false,
      message: 'propertyId is required'
    });
  }

  if (message && message.length > 500) {
    return res.status(400).json({
      success: false,
      message: 'Booking message cannot exceed 500 characters'
    });
  }

  // Validate property exists and is available
  const property = await Property.findById(propertyId);
  if (!property || !property.isActive) {
    return res.status(404).json({
      success: false,
      message: 'Property not found'
    });
  }

  if (property.status !== 'available') {
    return res.status(400).json({
      success: false,
      message: 'Property is no longer available for booking'
    });
  }

  // Cannot book your own property
  if (property.owner.toString() === req.user.id) {
    return res.status(400).json({
      success: false,
      message: 'You cannot request to book your own property'
    });
  }

  // Check for existing pending request
  const existingRequest = await BookingRequest.findOne({
    property: propertyId,
    tenant: req.user.id,
    status: 'pending'
  });

  if (existingRequest) {
    return res.status(400).json({
      success: false,
      message: 'You already have a pending booking request for this property'
    });
  }

  // Validate conversation belongs to the participants and the correct property
  let validConversationId = null;
  if (conversationId) {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: req.user.id,
      propertyId: propertyId
    });
    if (conversation) {
      validConversationId = conversation._id;
    }
  }

  const bookingRequest = await BookingRequest.create({
    property: propertyId,
    tenant: req.user.id,
    owner: property.owner,
    conversation: validConversationId,
    message: message || '',
    status: 'pending'
  });

  const populated = await BookingRequest.findById(bookingRequest._id)
    .populate('property', 'title images location rent status propertyType')
    .populate('tenant', 'name photoURL role')
    .populate('owner', 'name photoURL role')
    .lean();

  // Send system message in conversation
  const tenantName = req.user.name || 'A tenant';
  if (validConversationId) {
    sendSystemMessage(
      validConversationId,
      req.user.id,
      `${tenantName} sent a booking request${message ? `: "${message}"` : ''}`,
      {
        systemMessageType: 'booking_request',
        systemMessageMeta: { tenantName, message: message || '' }
      }
    );
  }

  // Push notification to owner (fire-and-forget)
  const propertyTitle = property.title || 'your property';
  sendPushToUser(
    property.owner.toString(),
    {
      title: 'New Booking Request',
      body: `Someone wants to book ${propertyTitle}`
    },
    {
      type: 'booking_request',
      propertyId: propertyId.toString(),
      bookingRequestId: bookingRequest._id.toString()
    }
  );

  // Socket event to conversation room
  emitBookingEvent(validConversationId, 'booking_status_changed', {
    conversationId: validConversationId?.toString(),
    bookingRequest: populated
  });

  res.status(201).json({
    success: true,
    data: populated
  });
});

/**
 * @desc    Get all booking requests made by the current user (tenant view)
 * @route   GET /api/bookings/my-requests
 * @access  Private
 */
exports.getMyRequests = asyncHandler(async (req, res) => {
  const requests = await BookingRequest.find({ tenant: req.user.id })
    .populate('property', 'title images location rent status propertyType')
    .populate('owner', 'name photoURL')
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    count: requests.length,
    data: requests
  });
});

/**
 * @desc    Get all booking requests for a specific property (owner view)
 * @route   GET /api/bookings/property/:propertyId
 * @access  Private (property owner only)
 */
exports.getPropertyRequests = asyncHandler(async (req, res) => {
  const { propertyId } = req.params;

  // Verify user is the property owner
  const property = await Property.findById(propertyId);
  if (!property) {
    return res.status(404).json({
      success: false,
      message: 'Property not found'
    });
  }

  if (property.owner.toString() !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: 'You are not the owner of this property'
    });
  }

  const requests = await BookingRequest.find({ property: propertyId })
    .populate('tenant', 'name photoURL role')
    .populate('conversation')
    .sort({ status: 1, createdAt: -1 })
    .lean();

  // Sort: pending first, then by createdAt desc
  requests.sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  res.status(200).json({
    success: true,
    count: requests.length,
    data: requests
  });
});

/**
 * @desc    Get all booking requests where the current user is the owner
 * @route   GET /api/bookings/owner-requests
 * @access  Private (owner)
 */
exports.getOwnerRequests = asyncHandler(async (req, res) => {
  const requests = await BookingRequest.find({ owner: req.user.id })
    .populate('property', 'title images location rent status propertyType')
    .populate('tenant', 'name photoURL')
    .sort({ createdAt: -1 })
    .lean();

  // Sort: pending first, then by createdAt desc
  requests.sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  res.status(200).json({
    success: true,
    count: requests.length,
    data: requests
  });
});

/**
 * @desc    Accept a booking request (auto-rejects all others for the same property)
 * @route   PATCH /api/bookings/:id/accept
 * @access  Private (property owner only)
 */
exports.acceptBookingRequest = asyncHandler(async (req, res) => {
  const bookingRequest = await BookingRequest.findById(req.params.id);

  if (!bookingRequest) {
    return res.status(404).json({
      success: false,
      message: 'Booking request not found'
    });
  }

  if (bookingRequest.owner.toString() !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: 'You are not authorized to accept this request'
    });
  }

  if (bookingRequest.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: `Cannot accept a request that is already ${bookingRequest.status}`
    });
  }

  // Verify property is still available
  const property = await Property.findById(bookingRequest.property);
  if (!property || property.status !== 'available') {
    return res.status(400).json({
      success: false,
      message: 'This property is no longer available for booking'
    });
  }

  // Accept this request
  bookingRequest.status = 'accepted';
  bookingRequest.respondedAt = new Date();
  await bookingRequest.save();

  // Auto-reject all other pending requests for the same property
  const rejectedRequests = await BookingRequest.find({
    property: bookingRequest.property,
    _id: { $ne: bookingRequest._id },
    status: 'pending'
  });

  if (rejectedRequests.length > 0) {
    await BookingRequest.updateMany(
      {
        property: bookingRequest.property,
        _id: { $ne: bookingRequest._id },
        status: 'pending'
      },
      {
        $set: {
          status: 'rejected',
          rejectionReason: 'Another tenant was selected',
          respondedAt: new Date()
        }
      }
    );
  }

  // Update property status to booked
  await Property.findByIdAndUpdate(bookingRequest.property, {
    status: 'booked'
  });

  const populated = await BookingRequest.findById(bookingRequest._id)
    .populate('property', 'title images location rent status propertyType')
    .populate('tenant', 'name photoURL role')
    .populate('owner', 'name photoURL role')
    .lean();

  const propertyTitle = populated.property?.title || 'the property';
  const ownerName = req.user.name || 'The owner';
  const acceptedTenantName = populated.tenant?.name || 'the tenant';

  // Push + socket to accepted tenant
  sendPushToUser(
    bookingRequest.tenant.toString(),
    {
      title: 'Booking Accepted!',
      body: `Your booking request for ${propertyTitle} was accepted!`
    },
    {
      type: 'booking_accepted',
      propertyId: bookingRequest.property.toString(),
      bookingRequestId: bookingRequest._id.toString()
    }
  );

  // System message in the conversation (visible to both owner and tenant)
  if (bookingRequest.conversation) {
    sendSystemMessage(
      bookingRequest.conversation,
      req.user.id,
      `${ownerName} accepted ${acceptedTenantName}'s booking request`,
      {
        systemMessageType: 'booking_accepted',
        systemMessageMeta: { ownerName, tenantName: acceptedTenantName }
      }
    );
  }

  emitBookingEvent(bookingRequest.conversation, 'booking_status_changed', {
    conversationId: bookingRequest.conversation?.toString(),
    bookingRequest: populated
  });

  // Notify all rejected tenants
  for (const rejected of rejectedRequests) {
    sendPushToUser(
      rejected.tenant.toString(),
      {
        title: 'Booking Update',
        body: `The owner chose another tenant for ${propertyTitle}`
      },
      {
        type: 'booking_rejected',
        propertyId: rejected.property.toString(),
        bookingRequestId: rejected._id.toString()
      }
    );

    if (rejected.conversation) {
      sendSystemMessage(
        rejected.conversation,
        req.user.id,
        `${ownerName} declined the booking request — another tenant was selected`,
        {
          systemMessageType: 'booking_auto_rejected',
          systemMessageMeta: { ownerName }
        }
      );

      emitBookingEvent(rejected.conversation, 'booking_status_changed', {
        conversationId: rejected.conversation.toString(),
        bookingRequest: {
          ...rejected.toObject(),
          status: 'rejected',
          rejectionReason: 'Another tenant was selected',
          respondedAt: new Date()
        }
      });
    }
  }

  res.status(200).json({
    success: true,
    data: populated
  });
});

/**
 * @desc    Reject a booking request
 * @route   PATCH /api/bookings/:id/reject
 * @access  Private (property owner only)
 */
exports.rejectBookingRequest = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const bookingRequest = await BookingRequest.findById(req.params.id);

  if (!bookingRequest) {
    return res.status(404).json({
      success: false,
      message: 'Booking request not found'
    });
  }

  if (bookingRequest.owner.toString() !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: 'You are not authorized to reject this request'
    });
  }

  if (bookingRequest.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: `Cannot reject a request that is already ${bookingRequest.status}`
    });
  }

  bookingRequest.status = 'rejected';
  bookingRequest.rejectionReason = reason || '';
  bookingRequest.respondedAt = new Date();
  await bookingRequest.save();

  const populated = await BookingRequest.findById(bookingRequest._id)
    .populate('property', 'title images location rent status propertyType')
    .populate('tenant', 'name photoURL role')
    .populate('owner', 'name photoURL role')
    .lean();

  const propertyTitle = populated.property?.title || 'the property';

  // Push notification to tenant
  sendPushToUser(
    bookingRequest.tenant.toString(),
    {
      title: 'Booking Request Declined',
      body: `Your booking request for ${propertyTitle} was declined`
    },
    {
      type: 'booking_rejected',
      propertyId: bookingRequest.property.toString(),
      bookingRequestId: bookingRequest._id.toString()
    }
  );

  // System message in conversation
  const rejectOwnerName = req.user.name || 'The owner';
  const rejectedTenantName = populated.tenant?.name || 'the tenant';
  if (bookingRequest.conversation) {
    sendSystemMessage(
      bookingRequest.conversation,
      req.user.id,
      `${rejectOwnerName} declined ${rejectedTenantName}'s booking request`,
      {
        systemMessageType: 'booking_rejected',
        systemMessageMeta: { ownerName: rejectOwnerName, tenantName: rejectedTenantName, reason: reason || '' }
      }
    );
  }

  emitBookingEvent(bookingRequest.conversation, 'booking_status_changed', {
    conversationId: bookingRequest.conversation?.toString(),
    bookingRequest: populated
  });

  res.status(200).json({
    success: true,
    data: populated
  });
});

/**
 * @desc    Cancel a booking request (by the tenant)
 * @route   PATCH /api/bookings/:id/cancel
 * @access  Private (tenant only)
 */
exports.cancelBookingRequest = asyncHandler(async (req, res) => {
  const bookingRequest = await BookingRequest.findById(req.params.id);

  if (!bookingRequest) {
    return res.status(404).json({
      success: false,
      message: 'Booking request not found'
    });
  }

  if (bookingRequest.tenant.toString() !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: 'You are not authorized to cancel this request'
    });
  }

  if (bookingRequest.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: `Cannot cancel a request that is already ${bookingRequest.status}`
    });
  }

  bookingRequest.status = 'cancelled';
  await bookingRequest.save();

  const populated = await BookingRequest.findById(bookingRequest._id)
    .populate('property', 'title images location rent status propertyType')
    .populate('tenant', 'name photoURL role')
    .populate('owner', 'name photoURL role')
    .lean();

  const propertyTitle = populated.property?.title || 'the property';

  // Push notification to owner
  sendPushToUser(
    bookingRequest.owner.toString(),
    {
      title: 'Booking Cancelled',
      body: `A tenant cancelled their booking request for ${propertyTitle}`
    },
    {
      type: 'booking_cancelled',
      propertyId: bookingRequest.property.toString(),
      bookingRequestId: bookingRequest._id.toString()
    }
  );

  // System message in conversation
  const cancelTenantName = req.user.name || 'The tenant';
  if (bookingRequest.conversation) {
    sendSystemMessage(
      bookingRequest.conversation,
      req.user.id,
      `${cancelTenantName} cancelled their booking request`,
      {
        systemMessageType: 'booking_cancelled',
        systemMessageMeta: { tenantName: cancelTenantName }
      }
    );
  }

  emitBookingEvent(bookingRequest.conversation, 'booking_status_changed', {
    conversationId: bookingRequest.conversation?.toString(),
    bookingRequest: populated
  });

  res.status(200).json({
    success: true,
    data: populated
  });
});

/**
 * @desc    Check current user's booking status for a property
 * @route   GET /api/bookings/check/:propertyId
 * @access  Private
 */
exports.checkBookingStatus = asyncHandler(async (req, res) => {
  const { propertyId } = req.params;

  const bookingRequest = await BookingRequest.findOne({
    property: propertyId,
    tenant: req.user.id
  })
    .sort({ createdAt: -1 })
    .populate('property', 'title status')
    .lean();

  res.status(200).json({
    success: true,
    data: bookingRequest || null
  });
});
