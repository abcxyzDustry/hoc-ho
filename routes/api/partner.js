import express from 'express';
import Partner from '../../models/Partner.js';
import Order from '../../models/Order.js';
import { nanoid } from 'nanoid';

const router = express.Router();

// ── REGISTER PARTNER ──
router.post('/register', async (req, res) => {
  try {
    const { full_name, phone, email, university, university_list, bio, personality_tags, plan } = req.body;
    
    if (!full_name || !phone || !university) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
    }

    // Check if phone already registered
    const existing = await Partner.findOne({ phone });
    if (existing) {
      return res.status(409).json({ 
        success: false, 
        message: 'Số điện thoại đã đăng ký. Vui lòng đăng nhập.',
        data: existing 
      });
    }

    const registerId = 'HC-' + nanoid(8).toUpperCase();
    const partner = await Partner.create({
      full_name,
      phone,
      email,
      university,
      university_list: university_list || [university],
      bio,
      personality_tags: personality_tags || [],
      plan: plan || 'standard',
      register_id: registerId,
      status: 'pending_payment'
    });

    res.status(201).json({
      success: true,
      message: 'Đăng ký thành công. Vui lòng thanh toán phí kích hoạt.',
      data: {
        register_id: registerId,
        phone,
        full_name,
        payment_needed: true
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// ── LOOKUP PARTNER ──
router.get('/lookup', async (req, res) => {
  try {
    const { phone, id } = req.query;
    let partner;

    if (phone) {
      partner = await Partner.findOne({ phone });
    } else if (id) {
      partner = await Partner.findOne({ $or: [{ register_id: id }, { _id: id }] });
    }

    if (!partner) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ' });
    }

    res.json({
      success: true,
      data: {
        id: partner._id,
        register_id: partner.register_id,
        full_name: partner.full_name,
        phone: partner.phone,
        university: partner.university,
        status: partner.status,
        payment_status: partner.payment_status,
        rating: partner.rating,
        completed_orders: partner.completed_orders,
        total_orders: partner.total_orders
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── CONFIRM PAYMENT ──
router.post('/payment-confirm', async (req, res) => {
  try {
    const { phone, id, paid } = req.body;
    let partner = phone
      ? await Partner.findOne({ phone })
      : await Partner.findOne({ $or: [{ register_id: id }, { _id: id }] });

    if (!partner) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ' });
    }

    if (paid) {
      partner.payment_status = 'paid';
      partner.payment_confirmed_at = new Date();
      partner.status = 'pending_approval';
      await partner.save();
      return res.json({
        success: true,
        message: 'Thanh toán xác nhận. Chờ admin duyệt hồ sơ.',
        data: { register_id: partner.register_id, status: partner.status }
      });
    } else {
      partner.payment_status = 'unpaid';
      await partner.save();
      return res.json({ success: true, message: 'Hồ sơ đã lưu. Thanh toán sau.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── TOGGLE ONLINE STATUS ──
router.post('/toggle-status', async (req, res) => {
  try {
    const { partner_id, is_online, latitude, longitude } = req.body;
    const partner = await Partner.findByIdAndUpdate(
      partner_id,
      {
        is_online,
        last_online_at: is_online ? new Date() : null,
        latitude: latitude || null,
        longitude: longitude || null
      },
      { new: true }
    );

    res.json({
      success: true,
      message: is_online ? 'Đã bật online' : 'Đã tắt online',
      data: { is_online: partner.is_online }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── RESPOND TO ORDER ──
router.post('/order-respond', async (req, res) => {
  try {
    const { order_id, partner_id, accept } = req.body;
    const order = await Order.findById(order_id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });
    }

    if (accept) {
      order.partner_id = partner_id;
      order.status = 'accepted';
      order.matched_at = new Date();
      await order.save();

      // Update partner stats
      await Partner.findByIdAndUpdate(partner_id, {
        $inc: { total_orders: 1 }
      });

      res.json({ success: true, message: 'Đã nhận đơn', data: order });
    } else {
      res.json({ success: true, message: 'Đã bỏ qua đơn' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

export default router;
