const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  username: String,
  // Either plain text (legacy/system) or encrypted content
  text: String,
  ciphertext: String, // base64
  iv: String,         // base64
  alg: String,        // e.g., 'AES-GCM'
  room: String,
  time: String,
  avatarUrl: String,
  system: Boolean
}, { timestamps: true });


module.exports = mongoose.model('Message', messageSchema);
