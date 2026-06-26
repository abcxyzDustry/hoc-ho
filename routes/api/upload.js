import express from 'express';
import multer from 'multer';
import { uploadImageBuffer } from '../../utils/cloudinary.js';
import { authCustomer } from '../../utils/auth.js';

const router = express.Router();

// Lưu tạm trong RAM rồi đẩy thẳng lên Cloudinary — không lưu ổ đĩa
// (bắt buộc với Render vì ổ đĩa bị xoá mỗi lần deploy/restart)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
});

// ── UPLOAD ẢNH THẺ SINH VIÊN ──
router.post('/student-card', authCustomer, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Thiếu file ảnh' });
    }
    const url = await uploadImageBuffer(req.file.buffer, 'hocho/student-cards');
    res.json({ success: true, data: { url } });
  } catch (err) {
    console.error('❌ Upload error:', err);
    res.status(500).json({ success: false, message: 'Lỗi upload ảnh: ' + err.message });
  }
});

export default router;
