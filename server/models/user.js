const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, sparse: true },
  username: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  avatarUrl: { type: String },
  rooms: [
    {
      code: { type: String, required: true },
      name: { type: String, required: true },
      lastJoinedAt: { type: Date, default: Date.now },
      lastUsername: { type: String },
      lastAvatarUrl: { type: String }
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);


