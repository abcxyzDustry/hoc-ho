import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  order_code:     { type: String, unique: true, sparse: true },

  // Customer
  customer_name:  { type: String, required: true },
  customer_phone: { type: String, required: true },
  customer_email: { type: String },
  customer_address:{ type: String },
  gender_needed:  { type: String, enum: ['male','female','any'], default: 'any' },

  // Partner
  partner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', sparse: true },

  // Location
  university:  { type: String, required: true },
  building:    { type: String },
  floor:       { type: String },
  room_number: { type: String, required: true },

  // Details
  requirements:      { type: String },
  personality_needed:[String],

  status: {
    type: String,
    enum: ['waiting','matching','accepted','in_progress','completed','cancelled','rejected'],
    default: 'waiting'
  },

  // Pricing
  price:          { type: Number, default: 200000 },
  platform_fee:   { type: Number, default: 60000 },   // 30%
  partner_earning:{ type: Number, default: 140000 },  // 70%

  // Payment
  payment_status: {
    type: String,
    enum: ['unpaid','pending','paid'],
    default: 'unpaid'
  },
  payment_confirmed_at: { type: Date },

  // Chat
  chat_active: { type: Boolean, default: false },

  // Timestamps
  matched_at:   { type: Date },
  started_at:   { type: Date },
  completed_at: { type: Date },
  cancelled_at: { type: Date },

  // Rating
  rating: { type: Number, min: 1, max: 5 },
  review: { type: String },

  // Cancel
  cancel_reason: { type: String },
  cancelled_by:  { type: String, enum: ['customer','partner','system'] }
}, { timestamps: true });

orderSchema.index({ customer_phone: 1, status: 1 });
orderSchema.index({ partner_id: 1, status: 1 });
orderSchema.index({ university: 1, status: 1 });
orderSchema.index({ createdAt: -1 });

export default mongoose.model('Order', orderSchema);
