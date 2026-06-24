// backend/routes/api/chatbot.js
import express from 'express';
const router = express.Router();

// Lấy API key từ environment variable
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Context cho chatbot
const CHATBOT_CONTEXT = `Bạn là HoCho Bot - trợ lý ảo của hocho.com. 
hocho.com là nền tảng hỗ trợ sinh viên ốm đau và gặp lý do bất khả kháng không thể đến lớp. 
Dịch vụ bao gồm: ghi chép bài giảng, chụp ảnh slide/bảng, tóm tắt nội dung, thông báo lịch thi và deadline.
Giá: 200.000đ/buổi. Đối tác nhận 140.000đ, platform nhận 60.000đ.
Không làm bài tập hộ hoặc thi hộ.
Đối tác cần đóng phí kích hoạt 200.000đ (1 lần).
Hãy trả lời ngắn gọn, thân thiện, nhiệt tình và luôn nhấn mạnh tính nhân văn của dịch vụ.`;

// Endpoint chat
router.post('/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Thiếu tin nhắn' });
    }

    // Nếu không có API key, dùng mock mode
    if (!GROQ_API_KEY) {
      console.warn('⚠️ GROQ_API_KEY chưa được cấu hình, đang dùng mock mode');
      const mockReply = getMockReply(message);
      return res.json({ 
        success: true, 
        reply: mockReply,
        mock: true 
      });
    }

    // Gọi Groq API
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'mixtral-8x7b-32768',
        messages: [
          { role: 'system', content: CHATBOT_CONTEXT },
          ...history.slice(-5).map(h => ({ role: h.role, content: h.content })),
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    const data = await response.json();
    
    if (data.choices && data.choices[0]) {
      const reply = data.choices[0].message.content;
      res.json({ 
        success: true, 
        reply: reply,
        mock: false 
      });
    } else {
      throw new Error('Không nhận được phản hồi từ Groq');
    }

  } catch (error) {
    console.error('Chatbot error:', error);
    // Fallback to mock khi API lỗi
    const mockReply = getMockReply(req.body.message || '');
    res.json({ 
      success: true, 
      reply: mockReply,
      mock: true,
      error: error.message 
    });
  }
});

// Mock replies khi không có API key
function getMockReply(message) {
  const lower = message.toLowerCase();
  
  const replies = {
    'dịch vụ': `HoCho.com là nền tảng hỗ trợ sinh viên ốm đau và gặp lý do bất khả kháng không thể đến lớp.

Chúng tôi cung cấp:
📝 Ghi chép bài giảng đầy đủ, chi tiết
📸 Chụp ảnh slide, bảng, tài liệu
📋 Tóm tắt nội dung chính của buổi học
📅 Thông báo lịch thi, deadline, thông tin quan trọng từ giảng viên

Giá chỉ 200.000đ/buổi! Bạn nhận được tài liệu đầy đủ mà không phải lo lắng về việc bỏ lỡ bài giảng.`,

    'giá': `💰 Giá dịch vụ của hocho.com:

• 200.000đ / buổi hỗ trợ (tối đa 2 giờ)
• Đối tác nhận: 140.000đ (70%)
• Nền tảng nhận: 60.000đ (30%)

Phí kích hoạt đối tác: 200.000đ (1 lần duy nhất)
Hoàn vốn chỉ sau 2 buổi hỗ trợ đầu tiên!`,

    'đặt': `📚 Cách đặt dịch vụ hocho.com:

1️⃣ Nhập thông tin: Trường, toà nhà, tầng, số phòng
2️⃣ Mô tả lý do cần hỗ trợ (ốm, tai nạn, việc gia đình...)
3️⃣ Hệ thống tìm đối tác gần nhất trong vòng 5 phút
4️⃣ Đối tác đến lớp, ghi chép và gửi tài liệu cho bạn

Nhanh chóng - Tiện lợi - Nhân văn!`,

    'đối tác': `💼 Để trở thành đối tác của hocho.com:

✅ Đăng ký tại: hocho.com/register
✅ Đóng phí kích hoạt: 200.000đ (1 lần)
✅ Chờ admin duyệt hồ sơ (24-48h)
✅ Bật online để nhận yêu cầu hỗ trợ

💵 Mỗi buổi hỗ trợ bạn nhận 140.000đ
📈 Thu nhập tiềm năng: 10 buổi/tháng = 1.400.000đ+`,

    'thanh toán': `💳 Thông tin thanh toán hocho.com:

Ngân hàng: VIB
Số tài khoản: 068394585
Tên tài khoản: HOCHO PLATFORM
Số tiền: 200.000đ

Nội dung chuyển khoản: HC KH [SĐT của bạn]
Ví dụ: HC KH 0912345678

Sau khi chuyển khoản, bấm "Tôi đã chuyển khoản" để xác nhận.
Admin sẽ xử lý trong 24-48h.`,

    'xin chào': `👋 Xin chào bạn! Mình là HoCho Bot - trợ lý ảo của hocho.com.

Mình có thể giúp bạn:
• Giới thiệu về dịch vụ
• Hướng dẫn đặt hỗ trợ
• Giải thích về giá cả
• Hướng dẫn đăng ký làm đối tác
• Hỗ trợ thanh toán

Bạn cần mình giúp gì hôm nay?`,

    'cảm ơn': `❤️ Không có gì bạn! Rất vui được giúp đỡ.

Nếu cần thêm thông tin, đừng ngần ngại hỏi mình nhé.
Chúc bạn một ngày tốt lành và sức khỏe thật tốt! 💚`,
  };

  // Tìm câu trả lời phù hợp
  for (const [key, value] of Object.entries(replies)) {
    if (lower.includes(key)) return value;
  }

  // Câu trả lời mặc định
  return `🤔 Cảm ơn câu hỏi của bạn!

Mình có thể giúp bạn với các chủ đề sau:
• 📝 Dịch vụ hocho.com là gì?
• 💰 Giá cả và phí dịch vụ
• 📚 Cách đặt hỗ trợ
• 💼 Đăng ký làm đối tác
• 💳 Thanh toán

Bạn có thể hỏi lại với từ khóa cụ thể nhé!
Hoặc liên hệ admin qua: support@hocho.com`;
}

export default router;
