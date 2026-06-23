import express from 'express';
import { createRequire } from 'module';
import Order from '../../models/Order.js';
import Partner from '../../models/Partner.js';

const require = createRequire(import.meta.url);
const { nanoid } = require('nanoid');
const router = express.Router();

// ── TẠO ĐƠN (sau khi khách xác nhận thông tin) ──
router.post('/create', async (req, res) => {
  try {
    const {
      customer_name, customer_phone, customer_email, customer_address,
      university, building, floor, room_number,
      requirements, personality_needed, gender_needed
    } = req.body;

    if (!customer_phone || !university || !room_number) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
    }

    const orderCode = 'CRB-' + Date.now() + '-' + nanoid(4).toUpperCase();
    const order = await Order.create({
      order_code:       orderCode,
      customer_name:    customer_name || 'Khách hàng',
      customer_phone,
      customer_email:   customer_email || '',
      customer_address: customer_address || '',
      university,
      building:         building || '',
      floor:            floor || '',
      room_number,
      requirements:     requirements || '',
      personality_needed: personality_needed || [],
      gender_needed:    gender_needed || 'any',
      status:           'waiting',
      payment_status:   'unpaid',
      chat_active:      false,
      price:            200000,
      platform_fee:     60000,
      partner_earning:  140000
    });

    res.status(201).json({
      success: true,
      message: 'Đơn tạo thành công. Vui lòng thanh toán.',
      data: {
        order_id:   order._id,
        order_code: orderCode,
        price:      order.price
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// ── XÁC NHẬN ĐÃ THANH TOÁN (khách bấm "đã thanh toán") ──
router.post('/confirm-payment', async (req, res) => {
  try {
    const { order_id } = req.body;
    const order = await Order.findByIdAndUpdate(
      order_id,
      { payment_status: 'pending', status: 'matching' },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });

    // Tìm đối tác online gần trường nhất
    const partners = await Partner.find({
      $or: [{ university }, { university_list: { $in: [order.university] } }],
      status: 'active',
      is_online: true
    }).limit(10);

    res.json({
      success: true,
      message: 'Đang tìm đối tác. Vui lòng chờ 15–30 phút.',
      data: {
        order_id:            order._id,
        order_code:          order.order_code,
        status:              order.status,
        partners_available:  partners.length
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── TRẠNG THÁI ĐƠN (polling từ app khách) ──
router.get('/status', async (req, res) => {
  try {
    const { order_id } = req.query;
    if (!order_id) return res.status(400).json({ success: false, message: 'Thiếu order_id' });

    const order = await Order.findById(order_id).populate('partner_id', 'full_name phone rating completed_orders personality_tags avatar_url');
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });

    res.json({
      success: true,
      data: {
        id:           order._id,
        order_code:   order.order_code,
        status:       order.status,
        payment_status: order.payment_status,
        university:   order.university,
        building:     order.building,
        floor:        order.floor,
        room_number:  order.room_number,
        requirements: order.requirements,
        gender_needed:order.gender_needed,
        price:        order.price,
        chat_active:  order.chat_active,
        partner: order.partner_id ? {
          id:               order.partner_id._id,
          full_name:        order.partner_id.full_name,
          phone:            order.partner_id.phone,
          rating:           order.partner_id.rating,
          completed_orders: order.partner_id.completed_orders,
          personality_tags: order.partner_id.personality_tags,
          avatar_url:       order.partner_id.avatar_url
        } : null,
        matched_at:   order.matched_at,
        completed_at: order.completed_at
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── ĐỐI TÁC: DANH SÁCH ĐƠN CHỜ THEO TRƯỜNG ──
router.get('/pending-for-partner', async (req, res) => {
  try {
    const { partner_id } = req.query;
    if (!partner_id) return res.status(400).json({ success: false, message: 'Thiếu partner_id' });

    const partner = await Partner.findById(partner_id);
    if (!partner || partner.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Tài khoản chưa kích hoạt' });
    }

    const unis = partner.university_list?.length ? partner.university_list : [partner.university];

    const orders = await Order.find({
      university:     { $in: unis },
      status:         'matching',
      payment_status: 'pending',
      partner_id:     null
    }).sort({ createdAt: -1 }).limit(20);

    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── ĐỐI TÁC: NHẬN ĐƠN ──
router.post('/accept', async (req, res) => {
  try {
    const { order_id, partner_id } = req.body;

    const order = await Order.findOne({ _id: order_id, status: 'matching', partner_id: null });
    if (!order) {
      return res.status(409).json({ success: false, message: 'Đơn đã được nhận hoặc không còn tồn tại' });
    }

    order.partner_id  = partner_id;
    order.status      = 'accepted';
    order.chat_active = true;
    order.matched_at  = new Date();
    await order.save();

    await Partner.findByIdAndUpdate(partner_id, { $inc: { total_orders: 1 } });

    res.json({
      success: true,
      message: 'Đã nhận đơn thành công!',
      data: {
        order_id:   order._id,
        order_code: order.order_code,
        customer_name:  order.customer_name,
        customer_phone: order.customer_phone,
        university:  order.university,
        building:    order.building,
        floor:       order.floor,
        room_number: order.room_number,
        requirements:order.requirements,
        gender_needed: order.gender_needed,
        price:         order.price,
        partner_earning: order.partner_earning
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── ĐỐI TÁC: TỪ CHỐI ĐƠN ──
router.post('/decline', async (req, res) => {
  try {
    const { order_id } = req.body;
    res.json({ success: true, message: 'Đã bỏ qua đơn' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── ĐỐI TÁC: BẮT ĐẦU CA (in_progress) ──
router.post('/start', async (req, res) => {
  try {
    const { order_id, partner_id } = req.body;
    const order = await Order.findOneAndUpdate(
      { _id: order_id, partner_id, status: 'accepted' },
      { status: 'in_progress', started_at: new Date() },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });
    res.json({ success: true, message: 'Ca học đã bắt đầu', data: { status: order.status } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── ĐỐI TÁC: HOÀN THÀNH ĐƠN ──
router.post('/complete', async (req, res) => {
  try {
    const { order_id, partner_id } = req.body;

    const order = await Order.findOneAndUpdate(
      { _id: order_id, partner_id, status: { $in: ['accepted','in_progress'] } },
      { status: 'completed', completed_at: new Date(), chat_active: false, payment_status: 'paid' },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });

    // Cộng số dư + completed_orders cho đối tác
    await Partner.findByIdAndUpdate(partner_id, {
      $inc: {
        completed_orders: 1,
        earnings_total:   order.partner_earning,
        balance:          order.partner_earning
      }
    });

    res.json({
      success: true,
      message: 'Đơn hoàn thành! Số dư đã được cập nhật.',
      data: {
        order_code:      order.order_code,
        partner_earning: order.partner_earning
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── HUỶ ĐƠN ──
router.post('/cancel', async (req, res) => {
  try {
    const { order_id, cancel_reason, cancelled_by } = req.body;
    const order = await Order.findByIdAndUpdate(
      order_id,
      { status: 'cancelled', cancelled_at: new Date(), cancel_reason, cancelled_by, chat_active: false },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });
    res.json({ success: true, message: 'Đã huỷ đơn' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── ĐÁNH GIÁ ──
router.post('/rate', async (req, res) => {
  try {
    const { order_id, rating, review } = req.body;
    if (!order_id || !rating) return res.status(400).json({ success: false, message: 'Thiếu thông tin' });

    const order = await Order.findByIdAndUpdate(order_id, { rating, review: review || '' }, { new: true });
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });

    if (order.partner_id) {
      const partner = await Partner.findById(order.partner_id);
      if (partner && partner.completed_orders > 0) {
        const newRating = ((partner.rating * (partner.completed_orders - 1)) + rating) / partner.completed_orders;
        await Partner.findByIdAndUpdate(order.partner_id, { rating: Math.round(newRating * 10) / 10 });
      }
    }

    res.json({ success: true, message: 'Cảm ơn bạn đã đánh giá!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── LỊCH SỬ ĐƠN ──
router.get('/list', async (req, res) => {
  try {
    const { partner_id, customer_phone, status, limit = 20 } = req.query;
    const q = {};
    if (partner_id)    q.partner_id = partner_id;
    if (customer_phone)q.customer_phone = customer_phone;
    if (status)        q.status = status;

    const orders = await Order.find(q)
      .populate('partner_id', 'full_name phone rating avatar_url')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

export default router;
