const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  username: String,
  text: String,
  room: String,
  time: String,
  avatarUrl: String,
  system: Boolean
}, { timestamps: true });


module.exports = mongoose.model('Message', messageSchema);
