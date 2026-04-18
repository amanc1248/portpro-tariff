const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        type: String,
        required: function () {
            return !this.imageUrl;
        },
        default: ''
    },
    imageUrl: {
        type: String,
        default: null
    },
    readBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    isSystemMessage: {
        type: Boolean,
        default: false
    },
    systemMessageType: {
        type: String,
        default: null
    },
    systemMessageMeta: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    isEdited: {
        type: Boolean,
        default: false
    },
    isDeleted: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, sender: 1 });

module.exports = mongoose.model('Message', messageSchema);
