import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema({
  // Order Reference
  order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  
  // Sender Info
  sender_type: { type: String, enum: ['customer', 'partner'], required: true },
  sender_id: { type: String },
  sender_name: { type: String },
  
  // Message
  message: { type: String, required: true },
  
  // Status
  read: { type: Boolean, default: false },
  read_at: { type: Date, sparse: true },
  
  created_at: { type: Date, default: Date.now }
}, { timestamps: true });

// Index for chat history queries
chatMessageSchema.index({ order_id: 1, created_at: 1 });
chatMessageSchema.index({ order_id: 1, read: 1 });

export default mongoose.model('ChatMessage', chatMessageSchema);
