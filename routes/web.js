import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

// Serve static HTML files
const publicDir = path.join(__dirname, '../public');

// Routes
router.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index'));
});

router.get('/register', (req, res) => {
  res.sendFile(path.join(publicDir, 'register'));
});

router.get('/payment', (req, res) => {
  res.sendFile(path.join(publicDir, 'payment'));
});

router.get('/admin', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin'));
});

export default router;
