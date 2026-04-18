const express = require('express');
const router = express.Router();
const {
    getConversations,
    getMessages,
    startConversation,
    markMessagesAsRead,
    sendImageMessage
} = require('../controllers/chat.controller');
const { protect } = require('../middleware/auth.middleware');
const { uploadSingle, handleUploadErrors } = require('../middleware/upload.middleware');

router.use(protect);

router.get('/conversations', getConversations);
router.get('/:conversationId/messages', getMessages);
router.put('/:conversationId/read', markMessagesAsRead);
router.post('/conversation', startConversation);
router.post(
    '/:conversationId/image',
    uploadSingle,
    handleUploadErrors,
    sendImageMessage
);

module.exports = router;
