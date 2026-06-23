import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

// Import routes
import webRoutes from './routes/web.js';
import partnerApi from './routes/api/partner.js';
import orderApi from './routes/api/order.js';
import chatApi from './routes/api/chat.js';
import adminApi from './routes/api/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/hocho';

// ── MIDDLEWARE ──
app.use(cors({
  origin: [process.env.FRONTEND_URL || 'http://localhost:3000'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// ── DATABASE CONNECTION ──
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection failed:', err));

// ── ROUTES ──

// Web routes (serve HTML)
app.use('/', webRoutes);

// API routes
app.use('/api/partner', partnerApi);
app.use('/api/order', orderApi);
app.use('/api/chat', chatApi);
app.use('/api/admin', adminApi);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ── ERROR HANDLER ──
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});

// ── START SERVER ──
app.listen(PORT, () => {
  console.log(`\n🚀 hocho.com Backend running on http://localhost:${PORT}`);
  console.log(`📊 MongoDB: ${MONGO_URI}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

export default app;
