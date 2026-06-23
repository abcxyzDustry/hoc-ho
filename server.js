import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

import webRoutes from './routes/web.js';
import partnerApi from './routes/api/partner.js';
import orderApi from './routes/api/order.js';
import chatApi from './routes/api/chat.js';
import adminApi from './routes/api/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// public/ nằm cùng cấp với server.js → backend/public/
const PUBLIC_DIR = path.join(__dirname, 'public');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/hocho';

// ── MIDDLEWARE ──
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── STATIC FILES (CSS, JS, images nếu có) ──
app.use(express.static(PUBLIC_DIR));

// ── DATABASE ──
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection failed:', err));

// ── ROUTES ──
app.use('/', webRoutes);
app.use('/api/partner', partnerApi);
app.use('/api/order', orderApi);
app.use('/api/chat', chatApi);
app.use('/api/admin', adminApi);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 CRABOR Backend running on http://localhost:${PORT}`);
  console.log(`📁 Serving HTML from: ${PUBLIC_DIR}`);
  console.log(`📊 MongoDB: ${MONGO_URI}`);
  console.log(`🌍 Env: ${process.env.NODE_ENV || 'development'}\n`);
});

export default app;
