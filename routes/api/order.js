import express from 'express';
import { createRequire } from 'module';
import Order from '../../models/Order.js';
import Partner from '../../models/Partner.js';

const require = createRequire(import.meta.url);
const { nanoid } = require('nanoid');

const router = express.Router();

// ── CREATE ORDER ──
router.post('/create', async (req, res) => {
  try {
    const {
      customer_name,
      customer_phone,
      university,
      building,
      floor,
      room_number,
      requirements,
      personality_needed
    } = req.body;

    if (!customer_phone || !university || !room_number) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
    }

    const orderCode = 'ORD-' + Date.now() + '-' + nanoid(4).toUpperCase();
    const order = await Order.create({
      order_code: orderCode,
      customer_name: customer_name || 'Khách hàng',
      customer_phone,
      university,
      building: building || '',
      floor: floor || '',
      room_number,
      requirements: requirements || '',
      personality_needed: personality_needed || [],
      status: 'waiting',
      price: 200000,
      platform_fee: 60000,
      partner_earning: 140000
    });

    // Find nearby active online partners
    const partners = await Partner.find({
      $or: [
        { university },
        { university_list: { $in: [university] } }
      ],
      status: 'active',
      is_online: true
    }).limit(5);

    res.status(201).json({
      success: true,
      message: 'Đơn tạo thành công. Đang quét đối tác...',
      data: {
        order_id: order._id,
        order_code: orderCode,
        partners_notified: partners.length
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// ── GET ORDER STATUS ──
router.get('/status', async (req, res) => {
  try {
    const { order_id } = req.query;
    if (!order_id) {
      return res.status(400).json({ success: false, message: 'Thiếu order_id' });
    }

    const order = await Order.findById(order_id).populate('partner_id');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });
    }

    res.json({
      success: true,
      data: {
        id: order._id,
        order_code: order.order_code,
        status: order.status,
        customer_name: order.customer_name,
        university: order.university,
        room_number: order.room_number,
        building: order.building,
        floor: order.floor,
        requirements: order.requirements,
        price: order.price,
        partner_earning: order.partner_earning,
        chat_active: order.chat_active,
        partner: order.partner_id ? {
          id: order.partner_id._id,
          full_name: order.partner_id.full_name,
          rating: order.partner_id.rating,
          completed_orders: order.partner_id.completed_orders,
          personality_tags: order.partner_id.personality_tags
        } : null,
        matched_at: order.matched_at,
        completed_at: order.completed_at
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── COMPLETE ORDER ──
router.post('/complete', async (req, res) => {
  try {
    const { order_id } = req.body;
    const order = await Order.findByIdAndUpdate(
      order_id,
      { status: 'completed', completed_at: new Date(), chat_active: false },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });
    }

    if (order.partner_id) {
      await Partner.findByIdAndUpdate(order.partner_id, {
        $inc: { completed_orders: 1, earnings_total: order.partner_earning }
      });
    }

    res.json({
      success: true,
      message: 'Đơn hoàn thành',
      data: { order_code: order.order_code }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── CANCEL ORDER ──
router.post('/cancel', async (req, res) => {
  try {
    const { order_id, cancel_reason, cancelled_by } = req.body;
    const order = await Order.findByIdAndUpdate(
      order_id,
      {
        status: 'cancelled',
        cancelled_at: new Date(),
        cancel_reason: cancel_reason || '',
        cancelled_by: cancelled_by || 'customer',
        chat_active: false
      },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });
    }

    res.json({
      success: true,
      message: 'Đơn đã huỷ',
      data: { order_code: order.order_code }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── RATE ORDER ──
router.post('/rate', async (req, res) => {
  try {
    const { order_id, rating, review } = req.body;

    if (!order_id || !rating) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin' });
    }

    const order = await Order.findByIdAndUpdate(
      order_id,
      { rating, review: review || '' },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });
    }

    if (order.partner_id) {
      const partner = await Partner.findById(order.partner_id);
      if (partner && partner.completed_orders > 0) {
        const totalRating = ((partner.rating * (partner.completed_orders - 1)) + rating) / partner.completed_orders;
        await Partner.findByIdAndUpdate(order.partner_id, {
          rating: Math.round(totalRating * 10) / 10
        });
      }
    }

    res.json({ success: true, message: 'Đánh giá thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── LIST ORDERS ──
router.get('/list', async (req, res) => {
  try {
    const { partner_id, customer_phone, status } = req.query;
    const query = {};
    if (partner_id) query.partner_id = partner_id;
    if (customer_phone) query.customer_phone = customer_phone;
    if (status) query.status = status;

    const orders = await Order.find(query).sort({ createdAt: -1 }).limit(20);
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── PENDING ORDERS FOR PARTNER ──
router.get('/pending-for-partner', async (req, res) => {
  try {
    const { partner_id } = req.query;
    if (!partner_id) {
      return res.status(400).json({ success: false, message: 'Thiếu partner_id' });
    }

    const partner = await Partner.findById(partner_id);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đối tác' });
    }

    const universities = partner.university_list?.length
      ? partner.university_list
      : [partner.university];

    const orders = await Order.find({
      $or: [
        { university: { $in: universities } }
      ],
      status: 'waiting',
      partner_id: null
    }).limit(10);

    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

export default router;
