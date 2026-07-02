import express from 'express';
import { createRequire } from 'module';
import Order from '../../models/Order.js';
import Partner from '../../models/Partner.js';
import Customer from '../../models/Customer.js';
import WalletTransaction from '../../models/WalletTransaction.js';
import StudentCardPhoto from '../../models/StudentCardPhoto.js';
import { authCustomer, authPartner } from '../../utils/auth.js';
import { sendPushNotifications } from '../../utils/push.js';

const require = createRequire(import.meta.url);
const { nanoid } = require('nanoid');
const router = express.Router();

// ── TẠO ĐƠN (khách đã đăng nhập) ──
router.post('/create', authCustomer, async (req, res) => {
  try {
    const {
      university, class_name, building, floor, room_number,
      requirements, personality_needed, gender_needed,
      student_card_photo_id, latitude, longitude
    } = req.body;

    if (!university || !room_number) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
    }

    const customer = await Customer.findById(req.customerId);
    if (!customer) return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' });

    const price = 200000;

    // Tự áp dụng số dư ví hocho (nếu có) vào đơn này -> giảm số tiền cần trả qua SePay
    const walletApplied = Math.min(customer.wallet_balance || 0, price);
    const sepayAmount = price - walletApplied;

    const orderCode = 'HC-' + Date.now() + '-' + nanoid(4).toUpperCase();
    const order = await Order.create({
      order_code:       orderCode,
      customer_id:      customer._id,
      customer_name:    customer.full_name,
      customer_phone:   customer.phone || '',
      customer_email:   customer.email || '',
      university,
      class_name:       class_name || '',
      building:         building || '',
      floor:            floor || '',
      room_number,
      requirements:     requirements || '',
      personality_needed: personality_needed || [],
      gender_needed:    gender_needed || 'any',
      student_card_photo_id: student_card_photo_id || undefined,
      location: (latitude && longitude) ? { type: 'Point', coordinates: [longitude, latitude] } : undefined,
      status:           'waiting',
      payment_status:   'unpaid',
      chat_active:      false,
      price,
      platform_fee:     60000,
      partner_earning:  140000,
      wallet_applied:   walletApplied,
    });

    // Gắn order_id vào ảnh thẻ SV đã upload trước đó (để biết xoá khi đơn kết thúc)
    if (student_card_photo_id) {
      await StudentCardPhoto.findByIdAndUpdate(student_card_photo_id, { order_id: order._id });
    }

    // Trừ ví ngay khi tạo đơn (nếu có áp dụng) — nếu sau này khách huỷ đơn sẽ hoàn lại
    if (walletApplied > 0) {
      await Customer.findByIdAndUpdate(customer._id, { $inc: { wallet_balance: -walletApplied } });
      await WalletTransaction.create({
        customer_id: customer._id, type: 'payment', amount: -walletApplied,
        order_id: order._id, note: `Dùng ví hocho thanh toán đơn ${orderCode}`
      });
    }

    res.status(201).json({
      success: true,
      message: sepayAmount === 0 ? 'Đơn đã được thanh toán đủ bằng ví hocho.' : 'Đơn tạo thành công. Vui lòng thanh toán.',
      data: {
        order_id: order._id,
        order_code: orderCode,
        price,
        wallet_applied: walletApplied,
        sepay_amount: sepayAmount, // 0 nghĩa là không cần mở màn QR nữa
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// ── KHÁCH BẤM "ĐÃ THANH TOÁN" Ở MÀN QR SEPAY ──
// ⚠️ KHÔNG tự chuyển đơn sang "matching" ở đây — đây mới chỉ là khách TỰ KHAI đã
// chuyển khoản, chưa có gì xác minh thật. Đơn vẫn nằm ở status "waiting" và CHỈ
// khi admin vào dashboard kiểm tra đúng đã nhận tiền trong tài khoản ngân hàng rồi
// bấm xác nhận (POST /api/admin/confirm-order-payment) thì đơn mới chuyển sang
// "matching" để đối tác thấy được — tránh trường hợp khách bấm khống mà chưa
// chuyển tiền thật vẫn được ghép đối tác.
router.post('/confirm-payment', authCustomer, async (req, res) => {
  try {
    const { order_id } = req.body;
    const order = await Order.findOne({ _id: order_id, customer_id: req.customerId });
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });

    order.payment_status = 'pending'; // khách tự khai đã CK — chờ admin xác nhận
    order.payment_claimed_at = new Date();
    await order.save();

    res.json({
      success: true,
      message: 'Đã ghi nhận. Admin sẽ xác nhận đã nhận tiền trong vài phút, đơn sẽ tự chuyển sang tìm đối tác.',
      data: { order_id: order._id, order_code: order.order_code, status: order.status }
    });
  } catch (err) {
    console.error('❌ [confirm-payment]', err);
    res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// ── TRẠNG THÁI ĐƠN (polling từ app khách) ──
router.get('/status', authCustomer, async (req, res) => {
  try {
    const { order_id } = req.query;
    if (!order_id) return res.status(400).json({ success: false, message: 'Thiếu order_id' });

    const order = await Order.findById(order_id).populate('partner_id', 'full_name phone rating completed_orders personality_tags avatar_url');
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });

    res.json({
      success: true,
      data: {
        id: order._id, order_code: order.order_code, status: order.status,
        payment_status: order.payment_status,
        university: order.university, building: order.building, floor: order.floor, room_number: order.room_number,
        requirements: order.requirements, gender_needed: order.gender_needed,
        price: order.price, chat_active: order.chat_active,
        partner: order.partner_id ? {
          id: order.partner_id._id, full_name: order.partner_id.full_name, phone: order.partner_id.phone,
          rating: order.partner_id.rating, completed_orders: order.partner_id.completed_orders,
          personality_tags: order.partner_id.personality_tags, avatar_url: order.partner_id.avatar_url
        } : null,
        matched_at: order.matched_at, heading_at: order.heading_at, arrived_at: order.arrived_at,
        started_at: order.started_at, completed_at: order.completed_at
      }
    });
  } catch (err) {
    console.error('❌ [routes/api/order.js]', err);
    res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// ── ĐỐI TÁC: DANH SÁCH ĐƠN CHỜ — AUTO-MATCH THEO BÁN KÍNH 5KM ──
router.get('/pending-for-partner', authPartner, async (req, res) => {
  try {
    const partner = await Partner.findById(req.partnerId);
    if (!partner || partner.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Tài khoản chưa kích hoạt' });
    }

    const baseQuery = { status: 'matching', payment_status: { $in: ['pending', 'paid'] }, partner_id: null };
    let orders = [];

    // Nếu đối tác có vị trí GPS -> tìm đơn trong bán kính 5km trước.
    // Bọc riêng try/catch vì $near CẦN có 2dsphere index — nếu vì lý do gì đó
    // (mới deploy, index chưa kịp build xong...) mà lỗi, vẫn rơi về tìm theo
    // trường ở dưới thay vì làm crash toàn bộ request.
    if (partner.latitude != null && partner.longitude != null) {
      try {
        orders = await Order.find({
          ...baseQuery,
          location: {
            $near: {
              $geometry: { type: 'Point', coordinates: [partner.longitude, partner.latitude] },
              $maxDistance: 5000 // mét
            }
          }
        }).limit(20);
      } catch (geoErr) {
        console.error('⚠️ [pending-for-partner] $near lỗi, rơi về tìm theo trường:', geoErr.message);
        orders = [];
      }
    }

    // Quá ít đơn gần (< 3) -> match bất kỳ đơn nào theo trường, không lọc khoảng cách
    if (orders.length < 3) {
      const unis = partner.university_list?.length ? partner.university_list : [partner.university];
      const fallback = await Order.find({ ...baseQuery, university: { $in: unis } })
        .sort({ createdAt: -1 }).limit(20);

      const existingIds = new Set(orders.map(o => String(o._id)));
      for (const o of fallback) {
        if (!existingIds.has(String(o._id))) orders.push(o);
      }
    }

    res.json({ success: true, data: orders.slice(0, 20) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// ── ĐỐI TÁC: NHẬN ĐƠN ──
router.post('/accept', authPartner, async (req, res) => {
  try {
    const { order_id } = req.body;
    const order = await Order.findOne({ _id: order_id, status: 'matching', partner_id: null });
    if (!order) return res.status(409).json({ success: false, message: 'Đơn đã được nhận hoặc không còn tồn tại' });

    order.partner_id  = req.partnerId;
    order.status      = 'accepted';
    order.chat_active = true;
    order.matched_at  = new Date();
    await order.save();

    await Partner.findByIdAndUpdate(req.partnerId, { $inc: { total_orders: 1 } });

    // Báo khách hàng đã match (rung + âm thanh local notification ở phía app)
    const customer = await Customer.findById(order.customer_id);
    if (customer?.push_token) {
      sendPushNotifications([customer.push_token], {
        title: '🎉 Đã có đối tác!',
        body: 'Đối tác đã nhận đơn học hộ của bạn.',
        data: { order_id: String(order._id), type: 'matched' }
      });
    }

    // Dựng URL ảnh thẻ SV động (route /api/upload/student-card/:id), kèm yêu cầu
    // app đối tác phải gửi Bearer token khi tải ảnh này (xem upload.js)
    const photoUrl = order.student_card_photo_id
      ? `${req.protocol}://${req.get('host')}/api/upload/student-card/${order.student_card_photo_id}`
      : null;

    res.json({
      success: true,
      message: 'Đã nhận đơn thành công!',
      data: {
        order_id: order._id, order_code: order.order_code,
        customer_name: order.customer_name, customer_phone: order.customer_phone,
        student_card_photo_url: photoUrl,
        university: order.university, class_name: order.class_name,
        building: order.building, floor: order.floor, room_number: order.room_number,
        requirements: order.requirements, gender_needed: order.gender_needed,
        price: order.price, partner_earning: order.partner_earning
      }
    });
  } catch (err) {
    console.error('❌ [routes/api/order.js]', err);
    res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// ── ĐỐI TÁC: TỪ CHỐI ĐƠN ──
router.post('/decline', authPartner, async (req, res) => {
  try {
    res.json({ success: true, message: 'Đã bỏ qua đơn' });
  } catch (err) {
    console.error('❌ [routes/api/order.js]', err);
    res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// ── ĐỐI TÁC: ĐANG ĐẾN ĐỊA CHỈ ──
router.post('/heading', authPartner, async (req, res) => {
  try {
    const { order_id } = req.body;
    const order = await Order.findOneAndUpdate(
      { _id: order_id, partner_id: req.partnerId, status: 'accepted' },
      { status: 'heading', heading_at: new Date() },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });
    res.json({ success: true, data: { status: order.status } });
  } catch (err) {
    console.error('❌ [routes/api/order.js]', err);
    res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// ── ĐỐI TÁC: ĐÃ ĐẾN NƠI ──
router.post('/arrived', authPartner, async (req, res) => {
  try {
    const { order_id } = req.body;
    const order = await Order.findOneAndUpdate(
      { _id: order_id, partner_id: req.partnerId, status: 'heading' },
      { status: 'arrived', arrived_at: new Date() },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });
    res.json({ success: true, data: { status: order.status } });
  } catch (err) {
    console.error('❌ [routes/api/order.js]', err);
    res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// ── ĐỐI TÁC: BẮT ĐẦU HỌC (in_progress) ──
router.post('/start', authPartner, async (req, res) => {
  try {
    const { order_id } = req.body;
    const order = await Order.findOneAndUpdate(
      { _id: order_id, partner_id: req.partnerId, status: { $in: ['arrived', 'accepted'] } },
      { status: 'in_progress', started_at: new Date() },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });
    res.json({ success: true, message: 'Ca học đã bắt đầu', data: { status: order.status } });
  } catch (err) {
    console.error('❌ [routes/api/order.js]', err);
    res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// ── ĐỐI TÁC: HỌC XONG - KẾT THÚC ĐƠN ──
router.post('/complete', authPartner, async (req, res) => {
  try {
    const { order_id } = req.body;

    const order = await Order.findOneAndUpdate(
      { _id: order_id, partner_id: req.partnerId, status: { $in: ['accepted','heading','arrived','in_progress'] } },
      { status: 'completed', completed_at: new Date(), chat_active: false, payment_status: 'paid' },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });

    // Tiền vào HÀNG CHỜ DUYỆT (pending_balance), admin duyệt mới sang balance rút được
    await Partner.findByIdAndUpdate(req.partnerId, {
      $inc: {
        completed_orders: 1,
        earnings_total:   order.partner_earning,
        pending_balance:  order.partner_earning
      }
    });

    // 🗑️ Xoá NGAY ảnh thẻ sinh viên khỏi MongoDB — đơn đã xong, không cần giữ lại
    if (order.student_card_photo_id) {
      await StudentCardPhoto.findByIdAndDelete(order.student_card_photo_id);
    }

    res.json({
      success: true,
      message: 'Đơn hoàn thành! 140.000đ đã vào hàng chờ admin duyệt.',
      data: { order_code: order.order_code, partner_earning: order.partner_earning }
    });
  } catch (err) {
    console.error('❌ [routes/api/order.js]', err);
    res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// ── HUỶ ĐƠN — HOÀN TIỀN VÀO VÍ HOCHO (không hoàn trực tiếp ra ngân hàng) ──
router.post('/cancel', authCustomer, async (req, res) => {
  try {
    const { order_id, cancel_reason } = req.body;
    const order = await Order.findOne({ _id: order_id, customer_id: req.customerId });
    if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });

    const refundAmount = (order.payment_status === 'paid' || order.payment_status === 'pending')
      ? (order.price - order.wallet_applied) // phần đã trả qua SePay
      : 0;

    order.status = 'cancelled';
    order.cancelled_at = new Date();
    order.cancel_reason = cancel_reason;
    order.cancelled_by = 'customer';
    order.chat_active = false;
    await order.save();

    if (refundAmount > 0) {
      await Customer.findByIdAndUpdate(req.customerId, { $inc: { wallet_balance: refundAmount } });
      await WalletTransaction.create({
        customer_id: req.customerId, type: 'refund', amount: refundAmount,
        order_id: order._id, note: `Hoàn tiền đơn huỷ ${order.order_code}`
      });
    }

    // 🗑️ Xoá NGAY ảnh thẻ sinh viên khỏi MongoDB khi đơn bị huỷ
    if (order.student_card_photo_id) {
      await StudentCardPhoto.findByIdAndDelete(order.student_card_photo_id);
    }

    res.json({ success: true, message: 'Đã huỷ đơn. Tiền đã hoàn vào ví hocho.', data: { refunded_to_wallet: refundAmount } });
  } catch (err) {
    console.error('❌ [routes/api/order.js]', err);
    res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// ── ĐÁNH GIÁ ──
router.post('/rate', authCustomer, async (req, res) => {
  try {
    const { order_id, rating, review } = req.body;
    if (!order_id || !rating) return res.status(400).json({ success: false, message: 'Thiếu thông tin' });

    const order = await Order.findOneAndUpdate(
      { _id: order_id, customer_id: req.customerId },
      { rating, review: review || '' }, { new: true }
    );
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
    console.error('❌ [routes/api/order.js]', err);
    res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// ── LỊCH SỬ ĐƠN (khách) ──
router.get('/my-orders', authCustomer, async (req, res) => {
  try {
    const orders = await Order.find({ customer_id: req.customerId })
      .populate('partner_id', 'full_name phone rating avatar_url')
      .sort({ createdAt: -1 }).limit(20);
    res.json({ success: true, data: orders });
  } catch (err) {
    console.error('❌ [routes/api/order.js]', err);
    res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// ── LỊCH SỬ ĐƠN (đối tác) ──
router.get('/partner-orders', authPartner, async (req, res) => {
  try {
    const { status } = req.query;
    const q = { partner_id: req.partnerId };
    if (status) q.status = status;
    const orders = await Order.find(q).sort({ createdAt: -1 }).limit(20);
    res.json({ success: true, data: orders });
  } catch (err) {
    console.error('❌ [routes/api/order.js]', err);
    res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

export default router;
