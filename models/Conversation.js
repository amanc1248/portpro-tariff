const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    lastMessage: {
        content: String,
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        createdAt: Date
    },
    propertyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Property'
    }
}, {
    timestamps: true
});

// Ensure unique conversation between two participants (optional but good for 1-on-1)
// For now, valid to keep simple.

conversationSchema.index({ participants: 1 });
conversationSchema.index({ 'lastMessage.createdAt': -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
