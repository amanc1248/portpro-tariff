const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');

/**
 * @desc    Get all conversations for current user
 * @route   GET /api/chat/conversations
 * @access  Private
 */
exports.getConversations = asyncHandler(async (req, res) => {
    const conversations = await Conversation.find({
        participants: req.user.id
    })
        .populate('participants', 'name photoURL role')
        .populate('propertyId', 'title description propertyType location rent images status isActive')
        .sort({ 'lastMessage.createdAt': -1 })
        .lean(); // Convert to plain JS objects for modification

    // Batch unread counts in a single aggregation
    const conversationIds = conversations.map(c => c._id);
    const unreadCounts = await Message.aggregate([
        {
            $match: {
                conversationId: { $in: conversationIds },
                sender: { $ne: new mongoose.Types.ObjectId(req.user.id) },
                readBy: { $ne: new mongoose.Types.ObjectId(req.user.id) }
            }
        },
        {
            $group: {
                _id: '$conversationId',
                count: { $sum: 1 }
            }
        }
    ]);

    const unreadMap = {};
    unreadCounts.forEach(u => { unreadMap[u._id.toString()] = u.count; });

    const conversationsWithUnread = conversations.map(conversation => ({
        ...conversation,
        unreadCount: unreadMap[conversation._id.toString()] || 0
    }));

    res.status(200).json({
        success: true,
        count: conversationsWithUnread.length,
        data: conversationsWithUnread
    });
});

/**
 * @desc    Get messages for a conversation
 * @route   GET /api/chat/:conversationId/messages
 * @access  Private
 */
exports.getMessages = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;

    // Verify user is participant and populate property
    const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: req.user.id
    })
        .populate('propertyId', 'title description propertyType location rent images status isActive amenities')
        .lean();

    if (!conversation) {
        return res.status(404).json({
            success: false,
            message: 'Conversation not found or unauthorized'
        });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const skip = (page - 1) * limit;

    const messages = await Message.find({ conversationId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    // Reverse to get chronological order for the client
    messages.reverse();

    const total = await Message.countDocuments({ conversationId });

    res.status(200).json({
        success: true,
        count: messages.length,
        total,
        data: messages,
        conversation,
        pagination: {
            page,
            limit,
            pages: Math.ceil(total / limit),
            hasMore: page * limit < total
        }
    });
});

/**
 * @desc    Mark messages as read
 * @route   PUT /api/chat/:conversationId/read
 * @access  Private
 */
exports.markMessagesAsRead = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;

    // Verify user is participant
    const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: req.user.id
    });

    if (!conversation) {
        return res.status(404).json({
            success: false,
            message: 'Conversation not found or unauthorized'
        });
    }

    // Update all messages in this conversation where user is not in readBy array
    const result = await Message.updateMany(
        {
            conversationId: conversationId,
            readBy: { $ne: req.user.id } // Not already read by this user
        },
        {
            $addToSet: { readBy: req.user.id } // Add user to readBy array
        }
    );

    res.status(200).json({
        success: true,
        message: 'Messages marked as read',
        modifiedCount: result.modifiedCount
    });
});

/**
 * @desc    Start or Get generic conversation with a user
 * @route   POST /api/chat/conversation
 * @access  Private
 */
exports.startConversation = asyncHandler(async (req, res) => {
    const { recipientId, propertyId } = req.body;

    if (!recipientId) {
        return res.status(400).json({
            success: false,
            message: 'Recipient ID is required'
        });
    }

    // Build query to find existing conversation
    const query = {
        participants: { $all: [req.user.id, recipientId] }
    };

    // If propertyId is provided, look for property-specific conversation
    // This allows separate chats per property between same users
    if (propertyId) {
        query.propertyId = propertyId;
    }

    let conversation = await Conversation.findOne(query);

    if (!conversation) {
        conversation = await Conversation.create({
            participants: [req.user.id, recipientId],
            propertyId: propertyId || null,
            lastMessage: {
                content: 'Conversation started',
                sender: req.user.id,
                createdAt: Date.now()
            }
        });
    }

    // Populate participants and property details
    conversation = await conversation.populate([
        { path: 'participants', select: 'name photoURL role' },
        { path: 'propertyId', select: 'title description propertyType location rent images status isActive amenities' }
    ]);

    res.status(200).json({
        success: true,
        data: conversation
    });
});
