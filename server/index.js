const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { Server } = require('socket.io');
const { nanoid } = require('nanoid');
const {
  createRoom,
  getRoom,
  getRoomCreator,
  getRoomCreatorName,
  deleteRoom,
  checkPassword,
  isUsernameTaken,
  addUserToRoom,
  removeUserFromRoom
} = require('./rooms');

const mongoose = require('mongoose');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

mongoose.connect('mongodb://localhost:27017/chatdb')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Аватар-завантаження
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });
app.post('/upload-avatar', upload.single('avatar'), (req, res) => {
  const filePath = `http://localhost:3001/uploads/${req.file.filename}`;
  res.json({ url: filePath });
});

io.on('connection', (socket) => {
  socket.data = {
    username: '',
    room: '',
    avatarUrl: '',
    isAdmin: false
  };

  socket.on('create_room', async ({ name, password, avatar }) => {
  console.log("створення кімнати:",name, password, avatar);
    const code = nanoid(5);
    socket.data.username = name;
    socket.data.room = code;
    socket.data.avatarUrl = avatar || `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(name)}`;
    socket.data.isAdmin = true;

    createRoom(code, socket.id, name, password);
    socket.join(code);
    socket.emit('you_are_admin');
    addUserToRoom(code, name);

    const systemJoin = {
      username: 'system',
      text: `${name} створив кімнату` ,
      room: code,
      time: new Date().toLocaleTimeString(),
      system: true
    };

    await Message.create(systemJoin);
    socket.emit('chat_history', { messages: [systemJoin], isAdmin: true });
    socket.emit('room_metadata', { creator: name, code });
  });

  // Приєднання до кімнати
  socket.on('join_room', async ({ name, code, password, avatar }) => {
    const roomInfo = getRoom(code);

    if (!roomInfo) return socket.emit('error_message', 'Кімнати з таким кодом не існує.');
    if (!checkPassword(code, password)) return socket.emit('error_message', 'Невірний пароль для кімнати.');
    if (isUsernameTaken(code, name)) return socket.emit('error_message', 'Ім’я вже зайняте в цій кімнаті.');

    socket.data.username = name;
    socket.data.room = code;
    socket.data.avatarUrl = avatar || `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(name)}`;
    socket.data.isAdmin = getRoomCreator(code) === socket.id;

    if (socket.data.isAdmin) socket.emit('you_are_admin');

    socket.join(code);
    addUserToRoom(code, name);

    const history = await Message.find({ room: code }).sort({ createdAt: 1 });
    socket.emit('chat_history', { messages: history, isAdmin: socket.data.isAdmin });

    const joinMsg = {
      username: 'system',
      text: `${name} приєднався до кімнати`,
      room: code,
      time: new Date().toLocaleTimeString(),
      system: true
    };

    await Message.create(joinMsg);
    io.to(code).emit('receive_message', joinMsg);

    const creator = getRoomCreatorName(code);
    io.to(code).emit('room_metadata', { creator, code });
  });

  socket.on('send_message', async (data) => {
    const { username, room, avatarUrl } = socket.data;
    const msg = {
      username,
      text: data.text,
      time: new Date().toLocaleTimeString(),
      room,
      avatarUrl
    };
    console.log(`Отримано повідомлення від ${username} в кімнаті ${room}: ${data.text}`);
    const saved = await Message.create(msg);
    io.to(room).emit('receive_message', saved);
  });

  socket.on('clear_messages', async () => {
    const { room } = socket.data;
    if (getRoomCreator(room) === socket.id) {
      await Message.deleteMany({ room });
      deleteRoom(room);
      io.to(room).emit('room_cleared');
    } else {
      socket.emit('error_message', 'Ви не є творцем кімнати');
    }
  });

socket.on('disconnect', async () => {
  const { room, username, isAdmin } = socket.data;

  if (room && username) {
    removeUserFromRoom(room, username);

    const leaveMsg = {
      username: 'system',
      text: `${username} покинув кімнату`,
      room,
      time: new Date().toLocaleTimeString(),
      system: true
    };
    await Message.create(leaveMsg);
    io.to(room).emit('receive_message', leaveMsg);

    if (isAdmin) {
      await Message.deleteMany({ room });
      deleteRoom(room);
      io.to(room).emit('room_cleared');
    }
  }
});
});
server.listen(3001, () => console.log('Сервер запущено на порту 3001'));