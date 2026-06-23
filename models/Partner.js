import mongoose from 'mongoose';

const partnerSchema = new mongoose.Schema({
  // Basic Info
  full_name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, unique: true, trim: true },
  email: { type: String, trim: true },
  
  // Registration & Status
  register_id: { type: String, unique: true, sparse: true },
  status: { 
    type: String, 
    enum: ['pending_payment', 'pending_approval', 'active', 'rejected', 'suspended'],
    default: 'pending_payment'
  },
  payment_status: { 
    type: String, 
    enum: ['unpaid', 'pending', 'paid'],
    default: 'unpaid'
  },
  payment_confirmed_at: { type: Date },
  
  // Plan & Registration
  plan: { type: String, default: 'standard' },
  university: { type: String },
  university_list: [String],
  bio: { type: String },
  personality_tags: [String],
  
  // Location
  latitude: { type: Number },
  longitude: { type: Number },
  is_online: { type: Boolean, default: false },
  last_online_at: { type: Date },
  
  // Avatar & Profile
  avatar_url: { type: String },
  device_token: { type: String }, // For push notifications
  
  // Performance
  rating: { type: Number, default: 5, min: 1, max: 5 },
  total_orders: { type: Number, default: 0 },
  completed_orders: { type: Number, default: 0 },
  earnings_total: { type: Number, default: 0 },
  
  // Timestamps
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { timestamps: true });

// Index for location-based queries
partnerSchema.index({ latitude: '2dsphere', longitude: '2dsphere' });
partnerSchema.index({ university: 1, is_online: 1 });
partnerSchema.index({ phone: 1, status: 1 });

export default mongoose.model('Partner', partnerSchema);
