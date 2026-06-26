import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

import webRoutes     from './routes/web.js';
import customerApi   from './routes/api/customer.js';
import partnerApi    from './routes/api/partner.js';
import orderApi      from './routes/api/order.js';
import chatApi       from './routes/api/chat.js';
import adminApi      from './routes/api/admin.js';
import uploadApi     from './routes/api/upload.js';
import chatbotApi    from './routes/api/chatbot.js';
import cronApi       from './routes/api/cron.js';
import { sendStudyReminder } from './utils/reminder.js';

// Pre-load models so mongoose knows about them
import './models/Customer.js';
import './models/Partner.js';
import './models/Order.js';
import './models/ChatMessage.js';
import './models/WithdrawRequest.js';
import './models/WalletTransaction.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');

const app    = express();
const PORT   = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/hocho';

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

app.use('/', webRoutes);
app.use('/api/customer', customerApi);
app.use('/api/partner',  partnerApi);
app.use('/api/order',    orderApi);
app.use('/api/chat',     chatApi);
app.use('/api/admin',    adminApi);
app.use('/api/upload',   uploadApi);
app.use('/api/chatbot',  chatbotApi);
app.use('/api/cron',     cronApi);

app.get('/health', (req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

app.use((req, res) =>
  res.status(404).json({ success: false, message: 'Route not found' })
);

app.use((err, req, res, next) => {
  console.error('❌', err);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// ── CRON NỘI BỘ: 6h30 sáng + mỗi giờ từ 7h-22h ──
// ⚠️ Chỉ chạy đúng giờ nếu server KHÔNG bị ngủ (Render free tier sẽ ngủ khi rảnh).
// Nếu dùng free tier, hãy trỏ 1 dịch vụ cron ngoài (cron-job.org) gọi
// GET /api/cron/send-reminder?secret=... vào các giờ tương ứng để đảm bảo chạy đúng giờ.
cron.schedule('30 6 * * *', () => {
  console.log('⏰ [cron nội bộ] Gửi nhắc nhở 6h30');
  sendStudyReminder().catch(err => console.error(err));
});
cron.schedule('0 7-22 * * *', () => {
  console.log('⏰ [cron nội bộ] Gửi nhắc nhở định kỳ mỗi giờ');
  sendStudyReminder().catch(err => console.error(err));
});

app.listen(PORT, () => {
  console.log(`\n🦀 hocho.com Backend  →  http://localhost:${PORT}`);
  console.log(`📁 Static files       →  ${PUBLIC_DIR}`);
  console.log(`📊 MongoDB            →  ${MONGO_URI}\n`);
});

export default app;
