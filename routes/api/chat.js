import express from 'express';
import ChatMessage from '../../models/ChatMessage.js';
import Order from '../../models/Order.js';

const router = express.Router();

// ── SEND MESSAGE ──
router.post('/send', async (req, res) => {
  try {
    const { order_id, sender_type, sender_id, sender_name, message } = req.body;

    if (!order_id || !sender_type || !message) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin' });
    }

    // Check if order exists and chat is active
    const order = await Order.findById(order_id);
    if (!order || !order.chat_active) {
      return res.status(403).json({ success: false, message: 'Chat đã đóng' });
    }

    const msg = await ChatMessage.create({
      order_id,
      sender_type,
      sender_id: sender_id || '',
      sender_name: sender_name || (sender_type === 'customer' ? 'Khách' : 'Đối tác'),
      message,
      read: false
    });

    res.status(201).json({
      success: true,
      data: {
        id: msg._id,
        order_id: msg.order_id,
        sender_type: msg.sender_type,
        sender_name: msg.sender_name,
        message: msg.message,
        created_at: msg.created_at
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── GET CHAT HISTORY ──
router.get('/history', async (req, res) => {
  try {
    const { order_id } = req.query;

    if (!order_id) {
      return res.status(400).json({ success: false, message: 'Thiếu order_id' });
    }

    const messages = await ChatMessage.find({ order_id })
      .sort({ created_at: 1 })
      .lean();

    res.json({ success: true, data: messages, total: messages.length });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── MARK AS READ ──
router.post('/read', async (req, res) => {
  try {
    const { order_id, reader_type } = req.body;

    if (!order_id || !reader_type) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin' });
    }

    // Mark all messages from the other party as read
    const result = await ChatMessage.updateMany(
      { order_id, sender_type: { $ne: reader_type }, read: false },
      { read: true, read_at: new Date() }
    );

    res.json({
      success: true,
      message: `Đã đọc ${result.modifiedCount} tin nhắn`,
      data: { marked_read: result.modifiedCount }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── GET UNREAD COUNT ──
router.get('/unread', async (req, res) => {
  try {
    const { order_id, reader_type } = req.query;

    const count = await ChatMessage.countDocuments({
      order_id,
      sender_type: { $ne: reader_type },
      read: false
    });

    res.json({ success: true, data: { unread_count: count } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

export default router;
