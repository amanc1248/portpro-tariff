const mongoose = require('mongoose');

const bookingRequestSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true,
    index: true
  },
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation'
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'cancelled'],
    default: 'pending',
    index: true
  },
  message: {
    type: String,
    maxlength: 500,
    default: ''
  },
  rejectionReason: {
    type: String,
    maxlength: 500
  },
  respondedAt: Date
}, {
  timestamps: true
});

// One pending request per tenant per property
bookingRequestSchema.index(
  { property: 1, tenant: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

bookingRequestSchema.index({ property: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('BookingRequest', bookingRequestSchema);
