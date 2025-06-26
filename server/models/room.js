const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  name: String,
  creatorSocketId: String,
  createdAt: String
}, { timestamps: true });

module.exports = mongoose.model('Room', roomSchema);
