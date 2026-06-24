// backend/server.js
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
import chatbotApi from './routes/api/chatbot.js'; // 👈 THÊM DÒNG NÀY

// Pre-load models
import './models/Partner.js';
import './models/Order.js';
import './models/ChatMessage.js';
import './models/WithdrawRequest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/crabor';

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

app.use('/', webRoutes);
app.use('/api/partner', partnerApi);
app.use('/api/order', orderApi);
app.use('/api/chat', chatApi);
app.use('/api/admin', adminApi);
app.use('/api/chatbot', chatbotApi); // 👈 THÊM DÒNG NÀY

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

app.listen(PORT, () => {
  console.log(`\🧠 hocho Backend  →  http://localhost:${PORT}`);
  console.log(`📁 Static files    →  ${PUBLIC_DIR}`);
  console.log(`📊 MongoDB         →  ${MONGO_URI}`);
  console.log(`🤖 Chatbot endpoint → /api/chatbot/chat\n`);
});

export default app;
