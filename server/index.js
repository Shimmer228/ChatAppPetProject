const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { Server } = require('socket.io');
const { createRoom, getRoomCreator, getRoomCreatorName, deleteRoom } = require('./rooms');

const mongoose = require('mongoose');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);

mongoose.connect('mongodb://localhost:27017/chatdb')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

app.use(cors());

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  socket.data = {
    username: '',
    room: '',
    avatarUrl: '',
    isAdmin: false
  };

  socket.on('join_room', async ({ name, roomName, avatar }) => {
    const roomSockets = io.sockets.adapter.rooms.get(roomName);
    let usersInRoom = [];

    if (roomSockets) {
      for (const socketId of roomSockets) {
        const s = io.sockets.sockets.get(socketId);
        if (s && s.data.username) {
          usersInRoom.push(s.data.username);
        }
      }
    }

    // 🔁 Перевірка на зайнятість імені
    if (usersInRoom.includes(name)) {
      if (!socket.handledNameError) {
        socket.emit('error_message', 'Користувач з таким ім\'ям вже в кімнаті. Виберіть інше ім\'я.');
        socket.handledNameError = true;
      }
      return;
    }

    socket.data.username = name;
    socket.data.room = roomName;
    socket.data.avatarUrl = avatar || `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(name)}`;

    createRoom(roomName, socket.id, name);
    socket.data.isAdmin = getRoomCreator(roomName) === socket.id;

    if (socket.data.isAdmin) {
      socket.emit('you_are_admin');
    }

    socket.join(roomName);

    const history = await Message.find({ room: roomName }).sort({ createdAt: 1 });
    socket.emit('chat_history', {
      messages: history,
      isAdmin: socket.data.isAdmin
    });

    const joinMsg = {
      username: 'system',
      text: `🟢 ${name} приєднався до кімнати`,
      room: roomName,
      time: new Date().toLocaleTimeString(),
      system: true
    };

    await Message.create(joinMsg);
    io.to(roomName).emit('receive_message', joinMsg);

    const creator = getRoomCreatorName(roomName);
    io.to(roomName).emit('room_metadata', { creator });
  });

  socket.on('send_message', async (data) => {
    const { username, room, avatarUrl } = socket.data;
    if (!username || !room) return;

    console.log('📥 Отримано повідомлення від', username, 'в кімнаті', room, ':', data.text);

    const msgData = {
      username,
      text: data.text,
      time: new Date().toLocaleTimeString(),
      room,
      avatarUrl
    };

    const saved = await Message.create(msgData);
    io.to(room).emit('receive_message', saved);
  });

  socket.on('clear_messages', async () => {
    const { room } = socket.data;

    if (getRoomCreator(room) === socket.id) {
      await Message.deleteMany({ room });

      // 🧹 Форсований вихід усіх сокетів
      const socketsInRoom = io.sockets.adapter.rooms.get(room);
      if (socketsInRoom) {
        for (const socketId of socketsInRoom) {
          const s = io.sockets.sockets.get(socketId);
          if (s) {
            s.leave(room);
            s.emit('room_cleared');
            s.data = { username: '', room: '', avatarUrl: '', isAdmin: false };
          }
        }
      }

      deleteRoom(room);
    } else {
      socket.emit('error_message', 'Ви не є творцем кімнати');
    }
  });

  socket.on('disconnect', async () => {
    const { room, username } = socket.data;
    if (room && username) {
      const leaveMsg = {
        username: 'system',
        text: `🔴 ${username} покинув кімнату`,
        room,
        time: new Date().toLocaleTimeString(),
        system: true
      };

      await Message.create(leaveMsg);
      io.to(room).emit('receive_message', leaveMsg);
    }
  });
});

// 🖼️ Завантаження аватарів
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.post('/upload-avatar', upload.single('avatar'), (req, res) => {
  const filePath = `http://localhost:3001/uploads/${req.file.filename}`;
  res.json({ url: filePath });
});

server.listen(3001, () => {
  console.log('🚀 Сервер запущено на порту 3001');
});
