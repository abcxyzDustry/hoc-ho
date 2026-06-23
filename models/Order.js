import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  // Order Identity
  order_code: { type: String, unique: true, sparse: true },
  
  // Customer Info
  customer_id: { type: String },
  customer_name: { type: String, required: true },
  customer_phone: { type: String, required: true },
  
  // Partner Info
  partner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', sparse: true },
  
  // Location Details
  university: { type: String, required: true },
  building: { type: String },
  floor: { type: String },
  room_number: { type: String, required: true },
  
  // Order Details
  requirements: { type: String },
  personality_needed: [String],
  status: {
    type: String,
    enum: ['waiting', 'matching', 'accepted', 'in_progress', 'completed', 'cancelled', 'rejected'],
    default: 'waiting'
  },
  
  // Pricing
  price: { type: Number, default: 200000 },
  platform_fee: { type: Number, default: 60000 }, // 30%
  partner_earning: { type: Number, default: 140000 }, // 70%
  
  // Payment
  payment_status: {
    type: String,
    enum: ['unpaid', 'pending', 'paid'],
    default: 'unpaid'
  },
  
  // Chat & Communication
  chat_active: { type: Boolean, default: true },
  partners_notified: { type: Number, default: 0 },
  
  // Timestamps
  matched_at: { type: Date, sparse: true },
  completed_at: { type: Date, sparse: true },
  cancelled_at: { type: Date, sparse: true },
  
  // Rating & Review
  rating: { type: Number, min: 1, max: 5, sparse: true },
  review: { type: String },
  
  // Cancellation
  cancel_reason: { type: String },
  cancelled_by: { type: String, enum: ['customer', 'partner', 'system'], sparse: true },
  
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes
orderSchema.index({ customer_phone: 1, status: 1 });
orderSchema.index({ partner_id: 1, status: 1 });
orderSchema.index({ university: 1, status: 1 });
orderSchema.index({ created_at: -1 });
orderSchema.index({ status: 1 });

export default mongoose.model('Order', orderSchema);
