import express from 'express';
import Partner from '../../models/Partner.js';
import Order from '../../models/Order.js';
import WithdrawRequest from '../../models/WithdrawRequest.js';

const router = express.Router();
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'crabor2024admin';

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
    const [partners, orders, pendingWithdraw] = await Promise.all([
      Partner.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Order.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      WithdrawRequest.aggregate([
        { $match: { status: 'pending' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ])
    ]);

    const partnerStats = { total:0, active:0, pending_payment:0, pending_approval:0, online_now:0 };
    partners.forEach(p => {
      partnerStats.total += p.count;
      if (p._id) partnerStats[p._id] = p.count;
    });
    partnerStats.online_now = await Partner.countDocuments({ is_online: true });

    const orderStats = { total:0, waiting:0, matching:0, accepted:0, in_progress:0, completed:0, cancelled:0 };
    orders.forEach(o => {
      orderStats.total += o.count;
      if (o._id) orderStats[o._id] = o.count;
    });

    const completedOrders = await Order.find({ status: 'completed' });
    const platformRevenue   = completedOrders.reduce((s, o) => s + o.platform_fee, 0);
    const partnerEarnings   = completedOrders.reduce((s, o) => s + o.partner_earning, 0);
    const paidCount         = await Partner.countDocuments({ payment_status: 'paid' });
    const registrationFee   = paidCount * 200000;

    // Tổng số dư chưa rút của tất cả partner
    const balanceAgg = await Partner.aggregate([
      { $group: { _id: null, totalBalance: { $sum: '$balance' }, totalWithdrawn: { $sum: '$withdrawn_total' } } }
    ]);

    res.json({
      success: true,
      data: {
        partners:   partnerStats,
        orders:     orderStats,
        revenue: {
          platform_orders:  platformRevenue,
          registration:     registrationFee,
          total:            platformRevenue + registrationFee,
          partner_earnings: partnerEarnings
        },
        withdrawals: {
          pending_count:  pendingWithdraw[0]?.count || 0,
          pending_amount: pendingWithdraw[0]?.total || 0,
          total_balance:  balanceAgg[0]?.totalBalance || 0,
          total_withdrawn:balanceAgg[0]?.totalWithdrawn || 0
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// ── DANH SÁCH ĐỐI TÁC ──
router.get('/partners', adminAuth, async (req, res) => {
  try {
    const { status } = req.query;
    const q = status ? { status } : {};
    const partners = await Partner.find(q)
      .select('full_name phone university status payment_status plan rating completed_orders total_orders earnings_total balance withdrawn_total is_online register_id createdAt')
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ success: true, data: partners });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── DANH SÁCH ĐƠN HÀNG ──
router.get('/orders', adminAuth, async (req, res) => {
  try {
    const { status } = req.query;
    const q = status ? { status } : {};
    const orders = await Order.find(q)
      .populate('partner_id', 'full_name phone')
      .select('order_code customer_name customer_phone university building floor room_number status payment_status price createdAt partner_id')
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── DUYỆT ĐỐI TÁC ──
router.post('/approve-partner', adminAuth, async (req, res) => {
  try {
    const { partner_id } = req.body;
    const partner = await Partner.findByIdAndUpdate(
      partner_id, { status: 'active' }, { new: true }
    );
    if (!partner) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    res.json({ success: true, message: `Đã duyệt ${partner.full_name}`, data: partner });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── TỪ CHỐI ĐỐI TÁC ──
router.post('/reject-partner', adminAuth, async (req, res) => {
  try {
    const { partner_id, reason } = req.body;
    const partner = await Partner.findByIdAndUpdate(
      partner_id, { status: 'rejected' }, { new: true }
    );
    if (!partner) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    res.json({ success: true, message: `Đã từ chối ${partner.full_name}` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── XÁC NHẬN THANH TOÁN PHÍ ĐĂNG KÝ ──
router.post('/confirm-payment', adminAuth, async (req, res) => {
  try {
    const { partner_id } = req.body;
    const partner = await Partner.findByIdAndUpdate(
      partner_id,
      { payment_status: 'paid', payment_confirmed_at: new Date(), status: 'pending_approval' },
      { new: true }
    );
    if (!partner) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    res.json({ success: true, message: `Đã xác nhận TT của ${partner.full_name}` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── DANH SÁCH YÊU CẦU RÚT TIỀN ──
router.get('/withdrawals', adminAuth, async (req, res) => {
  try {
    const { status } = req.query;
    const q = status ? { status } : {};
    const list = await WithdrawRequest.find(q)
      .populate('partner_id', 'full_name phone balance')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── DUYỆT RÚT TIỀN ──
router.post('/approve-withdrawal', adminAuth, async (req, res) => {
  try {
    const { request_id, admin_note } = req.body;
    const request = await WithdrawRequest.findByIdAndUpdate(
      request_id,
      { status: 'approved', admin_note: admin_note || '', processed_at: new Date() },
      { new: true }
    );
    if (!request) return res.status(404).json({ success: false, message: 'Không tìm thấy' });

    // Cộng vào withdrawn_total
    await Partner.findByIdAndUpdate(request.partner_id, {
      $inc: { withdrawn_total: request.amount }
    });

    res.json({ success: true, message: `Đã duyệt rút ${request.amount.toLocaleString('vi-VN')}đ cho ${request.partner_name}` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// ── TỪ CHỐI RÚT TIỀN (hoàn lại số dư) ──
router.post('/reject-withdrawal', adminAuth, async (req, res) => {
  try {
    const { request_id, admin_note } = req.body;
    const request = await WithdrawRequest.findByIdAndUpdate(
      request_id,
      { status: 'rejected', admin_note: admin_note || 'Từ chối bởi admin', processed_at: new Date() },
      { new: true }
    );
    if (!request) return res.status(404).json({ success: false, message: 'Không tìm thấy' });

    // Hoàn lại số dư
    await Partner.findByIdAndUpdate(request.partner_id, {
      $inc: { balance: request.amount }
    });

    res.json({ success: true, message: 'Đã từ chối và hoàn lại số dư' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

export default router;
