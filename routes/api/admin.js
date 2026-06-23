import express from 'express';
import Partner from '../../models/Partner.js';
import Order from '../../models/Order.js';

const router = express.Router();

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'hocho2024admin';

// ── AUTH MIDDLEWARE ──
const adminAuth = (req, res, next) => {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ success: false, message: 'Không được phép' });
  }
  next();
};

// ── DASHBOARD ──
router.get('/dashboard', adminAuth, async (req, res) => {
  try {
    const partners = {
      total: await Partner.countDocuments(),
      active: await Partner.countDocuments({ status: 'active' }),
      pending_payment: await Partner.countDocuments({ status: 'pending_payment' }),
      pending_approval: await Partner.countDocuments({ status: 'pending_approval' }),
      online_now: await Partner.countDocuments({ is_online: true })
    };

    const orders = {
      total: await Order.countDocuments(),
      waiting: await Order.countDocuments({ status: 'waiting' }),
      in_progress: await Order.countDocuments({ status: 'in_progress' }),
      completed: await Order.countDocuments({ status: 'completed' }),
      cancelled: await Order.countDocuments({ status: 'cancelled' })
    };

    const completedOrders = await Order.find({ status: 'completed' });
    const platformFeeTotal = completedOrders.reduce((sum, o) => sum + o.platform_fee, 0);
    const partnerEarningsTotal = completedOrders.reduce((sum, o) => sum + o.partner_earning, 0);

    const paidPartners = await Partner.find({ payment_status: 'paid' });
    const registrationFeeTotal = paidPartners.length * 200000;

    const revenue = {
      platform_orders: platformFeeTotal,
      registration: registrationFeeTotal,
      total: platformFeeTotal + registrationFeeTotal,
      partner_earnings: partnerEarningsTotal
    };

    res.json({
      success: true,
      data: { partners, orders, revenue }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── LIST PARTNERS ──
router.get('/partners', adminAuth, async (req, res) => {
  try {
    const { status } = req.query;
    let query = {};
    if (status) query.status = status;

    const partners = await Partner.find(query)
      .select('full_name phone university status payment_status rating completed_orders total_orders')
      .sort({ created_at: -1 })
      .limit(100);

    res.json({ success: true, data: partners });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── LIST ORDERS ──
router.get('/orders', adminAuth, async (req, res) => {
  try {
    const { status } = req.query;
    let query = {};
    if (status) query.status = status;

    const orders = await Order.find(query)
      .select('order_code customer_name customer_phone university building floor room_number status payment_status price created_at')
      .sort({ created_at: -1 })
      .limit(100);

    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── APPROVE PARTNER ──
router.post('/approve-partner', adminAuth, async (req, res) => {
  try {
    const { partner_id } = req.body;
    const partner = await Partner.findByIdAndUpdate(
      partner_id,
      { status: 'active' },
      { new: true }
    );

    res.json({
      success: true,
      message: `Đã duyệt đối tác ${partner.full_name}`,
      data: partner
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── REJECT PARTNER ──
router.post('/reject-partner', adminAuth, async (req, res) => {
  try {
    const { partner_id, reason } = req.body;
    const partner = await Partner.findByIdAndUpdate(
      partner_id,
      { status: 'rejected' },
      { new: true }
    );

    res.json({
      success: true,
      message: `Đã từ chối đối tác ${partner.full_name}`,
      data: partner
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── CONFIRM PAYMENT ──
router.post('/confirm-payment', adminAuth, async (req, res) => {
  try {
    const { partner_id } = req.body;
    const partner = await Partner.findByIdAndUpdate(
      partner_id,
      {
        payment_status: 'paid',
        status: 'pending_approval',
        payment_confirmed_at: new Date()
      },
      { new: true }
    );

    res.json({
      success: true,
      message: `Đã xác nhận thanh toán của ${partner.full_name}`,
      data: partner
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

export default router;
