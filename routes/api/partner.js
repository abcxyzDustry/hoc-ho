import express from 'express';
import { createRequire } from 'module';
import Partner from '../../models/Partner.js';
import WithdrawRequest from '../../models/WithdrawRequest.js';

const require = createRequire(import.meta.url);
const { nanoid } = require('nanoid');
const router = express.Router();

// ── ĐĂNG KÝ ──
router.post('/register', async (req, res) => {
  try {
    const { full_name, phone, email, university, university_list, bio, personality_tags, plan } = req.body;
    if (!full_name || !phone || !university) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
    }

    const existing = await Partner.findOne({ phone });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Số điện thoại đã đăng ký. Vui lòng tra cứu hồ sơ.',
        data: { register_id: existing.register_id }
      });
    }

    const registerId = 'CRB-S-' + nanoid(6).toUpperCase();
    const partner = await Partner.create({
      full_name, phone, email,
      university,
      university_list: university_list || [university],
      bio, personality_tags: personality_tags || [],
      plan: plan || 'standard',
      register_id: registerId,
      status: 'pending_payment'
    });

    res.status(201).json({
      success: true,
      message: 'Đăng ký thành công. Vui lòng thanh toán phí kích hoạt.',
      data: { register_id: registerId, phone, full_name }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// ── TRA CỨU HỒ SƠ ──
router.get('/lookup', async (req, res) => {
  try {
    const { phone, id } = req.query;
    const partner = phone
      ? await Partner.findOne({ phone })
      : await Partner.findOne({ $or: [{ register_id: id }, { _id: id }] });

    if (!partner) return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ' });

    res.json({
      success: true,
      data: {
        id:               partner._id,
        register_id:      partner.register_id,
        full_name:        partner.full_name,
        phone:            partner.phone,
        university:       partner.university,
        status:           partner.status,
        payment_status:   partner.payment_status,
        rating:           partner.rating,
        completed_orders: partner.completed_orders,
        total_orders:     partner.total_orders,
        balance:          partner.balance,
        earnings_total:   partner.earnings_total
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── PAYMENT PLAN (cho payment.html) ──
router.get('/payment-plan', async (req, res) => {
  try {
    const { phone, id } = req.query;
    const partner = phone
      ? await Partner.findOne({ phone })
      : await Partner.findOne({ $or: [{ register_id: id }, { _id: id }] });

    if (!partner) return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ' });

    res.json({
      success: true,
      data: {
        registerId: partner.register_id,
        phone:      partner.phone,
        full_name:  partner.full_name,
        plan:       partner.plan || 'standard',
        fee:        200000,
        slotsLeft:  50
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── XÁC NHẬN THANH TOÁN ──
router.post('/payment-confirm', async (req, res) => {
  try {
    const { phone, id, paid } = req.body;
    const partner = phone
      ? await Partner.findOne({ phone })
      : await Partner.findOne({ $or: [{ register_id: id }, { _id: id }] });

    if (!partner) return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ' });

    if (paid) {
      partner.payment_status       = 'pending';
      partner.status               = 'pending_approval';
      await partner.save();
      return res.json({
        success: true,
        message: 'Đã ghi nhận. Admin sẽ xác nhận thanh toán và duyệt hồ sơ.',
        data: { registerId: partner.register_id, status: partner.status }
      });
    } else {
      return res.json({
        success: true,
        message: 'Hồ sơ đã lưu.',
        data: { registerId: partner.register_id }
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── BẬT / TẮT ONLINE ──
router.post('/toggle-status', async (req, res) => {
  try {
    const { partner_id, is_online, latitude, longitude } = req.body;
    const partner = await Partner.findByIdAndUpdate(
      partner_id,
      { is_online, last_online_at: is_online ? new Date() : null, latitude, longitude },
      { new: true }
    );
    if (!partner) return res.status(404).json({ success: false, message: 'Không tìm thấy đối tác' });
    res.json({ success: true, data: { is_online: partner.is_online } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── THÔNG TIN + SỐ DƯ ──
router.get('/profile', async (req, res) => {
  try {
    const { partner_id } = req.query;
    const partner = await Partner.findById(partner_id).select(
      'full_name phone email university status is_online rating completed_orders total_orders earnings_total balance withdrawn_total avatar_url personality_tags'
    );
    if (!partner) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    res.json({ success: true, data: partner });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── GỬI YÊU CẦU RÚT TIỀN ──
router.post('/withdraw', async (req, res) => {
  try {
    const { partner_id, amount, bank_name, bank_account, bank_owner } = req.body;

    if (!partner_id || !amount || !bank_name || !bank_account || !bank_owner) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin rút tiền' });
    }

    const partner = await Partner.findById(partner_id);
    if (!partner) return res.status(404).json({ success: false, message: 'Không tìm thấy đối tác' });

    if (amount > partner.balance) {
      return res.status(400).json({
        success: false,
        message: `Số dư không đủ. Số dư hiện tại: ${partner.balance.toLocaleString('vi-VN')}đ`
      });
    }

    if (amount < 50000) {
      return res.status(400).json({ success: false, message: 'Số tiền rút tối thiểu là 50.000đ' });
    }

    // Trừ số dư tạm thời (giữ cho đến khi admin duyệt)
    await Partner.findByIdAndUpdate(partner_id, { $inc: { balance: -amount } });

    const request = await WithdrawRequest.create({
      partner_id,
      partner_name:  partner.full_name,
      partner_phone: partner.phone,
      amount,
      bank_name,
      bank_account,
      bank_owner,
      status: 'pending'
    });

    res.status(201).json({
      success: true,
      message: 'Yêu cầu rút tiền đã được gửi. Admin sẽ xử lý trong 24h.',
      data: {
        request_id:    request._id,
        amount,
        remaining_balance: partner.balance - amount
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// ── LỊCH SỬ RÚT TIỀN ──
router.get('/withdraw-history', async (req, res) => {
  try {
    const { partner_id } = req.query;
    const history = await WithdrawRequest.find({ partner_id }).sort({ createdAt: -1 }).limit(20);
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

export default router;
