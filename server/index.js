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
  getRoomName,
  getRoomNameEnc,
  deleteRoom,
  checkPassword,
  isUsernameTaken,
  addUserToRoom,
  removeUserFromRoom,
  getUsers,
  setRoomCreator,
  getRoomsCount
} = require('./rooms');

const mongoose = require('mongoose');
const Message = require('./models/Message');
const User = require('./models/user');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

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
app.use(express.json());
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

// Update account avatar
app.post('/me/avatar', authMiddleware, async (req, res) => {
  try {
    const { avatarUrl } = req.body || {};
    if (!avatarUrl) return res.status(400).json({ error: 'avatarUrl required' });
    const user = await User.findByIdAndUpdate(req.user.uid, { $set: { avatarUrl } }, { new: true });
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, user: { id: user._id, username: user.username, email: user.email, avatarUrl: user.avatarUrl } });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update avatar' });
  }
});

// Auth routes
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

app.post('/auth/register', async (req, res) => {
  try {
    const { username, email, password, avatarUrl } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username and password are required' });
    
    // Check if username already exists
    const existingUsername = await User.findOne({ username });
    if (existingUsername) return res.status(409).json({ error: 'Username already exists' });
    
    // Check email only if provided and not empty
    if (email && email.trim()) {
      const existingEmail = await User.findOne({ email: email.trim() });
      if (existingEmail) return res.status(409).json({ error: 'Email already exists' });
    }
    
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email: email && email.trim() ? email.trim() : undefined, passwordHash, avatarUrl });
    const token = jwt.sign({ uid: user._id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user._id, username: user.username, email: user.email, avatarUrl: user.avatarUrl } });
  } catch (e) {
    console.error('Registration error:', e);
    if (e.code === 11000) {
      // Duplicate key error from MongoDB
      const field = Object.keys(e.keyPattern || {})[0];
      return res.status(409).json({ error: `${field} already exists` });
    }
    res.status(500).json({ error: 'Registration failed', details: e.message });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    const user = await User.findOne(username ? { username } : { email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password || '', user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ uid: user._id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user._id, username: user.username, email: user.email, avatarUrl: user.avatarUrl } });
  } catch (e) {
    res.status(500).json({ error: 'Login failed' });
  }
});

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ')? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

app.get('/me/chats', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.uid).lean();
    if (!user) return res.status(404).json({ error: 'Not found' });
    console.log(`[me/chats] User ${req.user.uid} has ${user.rooms?.length || 0} rooms`);
    // Sort by lastJoinedAt desc
    const rooms = (user.rooms || []).sort((a, b) => {
      const dateA = a.lastJoinedAt ? new Date(a.lastJoinedAt) : new Date(0);
      const dateB = b.lastJoinedAt ? new Date(b.lastJoinedAt) : new Date(0);
      return dateB - dateA;
    });
    console.log(`[me/chats] Returning ${rooms.length} rooms`);
    res.json({ rooms });
  } catch (e) {
    console.error('[me/chats] Error:', e);
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

app.delete('/me/chats/:code', authMiddleware, async (req, res) => {
  try {
    const { code } = req.params;
    const user = await User.findByIdAndUpdate(
      req.user.uid,
      { $pull: { rooms: { code } } },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'Not found' });
    console.log(`[me/chats] Removed room ${code} from user ${req.user.uid}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('[me/chats] Delete error:', e);
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

io.on('connection', (socket) => {
  // attach user if token is provided
  const token = socket.handshake.auth && socket.handshake.auth.token;
  let userId = null;
  let jwtUser = null;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      userId = payload.uid;
      jwtUser = payload;
      console.log(`[socket] User ${userId} connected`);
    } catch (e) {
      console.log(`[socket] Invalid token:`, e.message);
      // ignore invalid tokens
    }
  } else {
    console.log(`[socket] Guest connection (no token)`);
  }
  socket.data = {
    userId: userId,
    jwtUser: jwtUser,
    username: '',
    room: '',
    avatarUrl: '',
    isAdmin: false
  };

  socket.on('create_room', async ({ name, roomName, avatar }) => {
    // Only authenticated users can create rooms
    if (!socket.data.userId) {
      return socket.emit('error_message', 'Лише зареєстровані користувачі можуть створювати кімнати');
    }
    // Limit total active rooms to 1000
    try {
      if (getRoomsCount() >= 1000) {
        return socket.emit('error_message', 'Ліміт кімнат досягнуто (1000)');
      }
    } catch {}
  console.log("створення кімнати:", name, roomName, avatar);
    const code = nanoid(30);
    socket.data.username = name;
    socket.data.room = code;
    socket.data.avatarUrl = avatar || `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(name)}`;
    socket.data.isAdmin = true;

    createRoom(code, socket.id, name, roomName || '');
    socket.join(code);
    socket.emit('you_are_admin');
    addUserToRoom(code, name);
    emitParticipants(code);

    const systemJoin = {
      username: 'system',
      text: `${name} створив кімнату` ,
      room: code,
      time: new Date().toLocaleTimeString(),
      system: true
    };

    await Message.create(systemJoin);
    socket.emit('chat_history', { messages: [systemJoin], isAdmin: true });
    socket.emit('room_metadata', { creator: name, code, name: roomName || '', nameEnc: getRoomNameEnc(code) });

    // persist room to user profile if authenticated
    if (socket.data.userId) {
      const uid = socket.data.userId;
      const nameVal = roomName || '';
      const lastUsername = socket.data.username || name;
      const lastAvatarUrl = socket.data.avatarUrl || '';
      console.log(`[create_room] Saving room ${code} to user ${uid}`);
      // First remove existing room with same code (if any)
      await User.findByIdAndUpdate(uid, { $pull: { rooms: { code } } });
      // Then add the room with updated timestamp and user info
      await User.findByIdAndUpdate(uid, { 
        $push: { 
          rooms: { 
            code, 
            name: nameVal, 
            lastJoinedAt: new Date(),
            lastUsername,
            lastAvatarUrl
          } 
        } 
      });
    } else {
      console.log(`[create_room] No userId, skipping room save`);
    }
  });

  // Приєднання до кімнати
  socket.on('join_room', async ({ name, code, avatar, savedUsername }) => {
    const roomInfo = getRoom(code);

    if (!roomInfo) return socket.emit('error_message', 'Кімнати з таким кодом не існує.');
    
    // Allow using saved username even if it's "taken" (user might be reconnecting)
    // If user provides savedUsername that matches, they're reconnecting with their previous name
    const isUsingSavedName = savedUsername && name === savedUsername;
    
    if (!isUsingSavedName && isUsernameTaken(code, name)) {
      return socket.emit('error_message', 'Ім’я вже зайняте в цій кімнаті.');
    }

    // If using saved name and it's "taken", remove it first (user is reconnecting)
    if (isUsingSavedName && isUsernameTaken(code, name)) {
      removeUserFromRoom(code, name);
    }

    socket.data.username = name;
    socket.data.room = code;
    socket.data.avatarUrl = avatar || `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(name)}`;
    socket.data.isAdmin = getRoomCreator(code) === socket.id;

    if (socket.data.isAdmin) socket.emit('you_are_admin');

    socket.join(code);
    addUserToRoom(code, name);
    emitParticipants(code);

    const history = await Message.find({ room: code }).sort({ createdAt: 1 });
    socket.emit('chat_history', { messages: history, isAdmin: socket.data.isAdmin });

    // Only announce join if this is a fresh join, not a silent reconnect
    if (!isUsingSavedName) {
      const joinMsg = {
        username: 'system',
        text: `${name} приєднався до кімнати`,
        room: code,
        time: new Date().toLocaleTimeString(),
        system: true
      };
      await Message.create(joinMsg);
      io.to(code).emit('receive_message', joinMsg);
    }

    const creator = getRoomCreatorName(code);
    const roomNameValue = getRoomName(code);
    io.to(code).emit('room_metadata', { creator, code, name: roomNameValue, nameEnc: getRoomNameEnc(code) });

    // persist room to user profile if authenticated
    if (socket.data.userId) {
      const uid = socket.data.userId;
      const nameVal = roomNameValue || '';
      const lastUsername = socket.data.username || name;
      const lastAvatarUrl = socket.data.avatarUrl || '';
      console.log(`[join_room] Saving room ${code} to user ${uid}`);
      // First remove existing room with same code (if any)
      await User.findByIdAndUpdate(uid, { $pull: { rooms: { code } } });
      // Then add the room with updated timestamp and user info
      await User.findByIdAndUpdate(uid, { 
        $push: { 
          rooms: { 
            code, 
            name: nameVal, 
            lastJoinedAt: new Date(),
            lastUsername,
            lastAvatarUrl
          } 
        } 
      });
    } else {
      console.log(`[join_room] No userId, skipping room save`);
    }
  });

  // Provide participants list on demand
  socket.on('request_participants', () => {
    const { room } = socket.data;
    if (!room) return;
    emitParticipants(room, socket.id);
  });

  // Admin sets encrypted room name blob { ciphertext, iv, alg }
  socket.on('set_room_name_enc', ({ nameEnc }) => {
    const { room } = socket.data;
    if (!room) return;
    if (getRoomCreator(room) !== socket.id) {
      return socket.emit('error_message', 'Лише власник може змінювати назву кімнати');
    }
    if (!nameEnc || typeof nameEnc !== 'object') return;
    setRoomNameEnc(room, nameEnc);
    const creator = getRoomCreatorName(room);
    io.to(room).emit('room_metadata', { creator, code: room, name: getRoomName(room), nameEnc: getRoomNameEnc(room) });
  });

  // Owner can kick a user from the room
  socket.on('kick_user', async ({ username }) => {
    const { room } = socket.data;
    if (!room) return;
    if (getRoomCreator(room) !== socket.id) {
      return socket.emit('error_message', 'Лише власник кімнати може видаляти користувачів');
    }
    removeUserFromRoom(room, username);
    // Disconnect or force leave all sockets of that username in the room
    const sockets = await io.in(room).fetchSockets();
    for (const s of sockets) {
      if (s.data?.username === username) {
        s.emit('kicked', { room });
        s.leave(room);
        s.data.room = '';
        try { s.disconnect(true); } catch {}
      }
    }
    emitParticipants(room);
    const sys = { username: 'system', text: `${username} був видалений власником`, room, time: new Date().toLocaleTimeString(), system: true };
    await Message.create(sys);
    io.to(room).emit('receive_message', sys);
  });

  // Owner can transfer ownership to another user in the room
  socket.on('transfer_ownership', async ({ username }) => {
    const { room } = socket.data;
    if (!room) return;
    if (getRoomCreator(room) !== socket.id) {
      return socket.emit('error_message', 'Лише власник може передавати власництво');
    }
    const sockets = await io.in(room).fetchSockets();
    const target = sockets.find((s) => s.data?.username === username);
    if (!target) return socket.emit('error_message', 'Користувача не знайдено в кімнаті');
    if (!target.data?.userId) {
      return socket.emit('error_message', 'Не можна передавати власність гостю');
    }
    setRoomCreator(room, target.id, username);
    // notify clients about new metadata
    const creator = getRoomCreatorName(room);
    const roomNameValue = getRoomName(room);
    io.to(room).emit('room_metadata', { creator, code: room, name: roomNameValue, nameEnc: getRoomNameEnc(room) });
    // update admin flags on sockets
    for (const s of sockets) {
      if (s.id === target.id) {
        s.data.isAdmin = true;
        s.emit('you_are_admin');
      } else if (s.id === socket.id || s.data?.isAdmin) {
        s.data.isAdmin = false;
        s.emit('you_are_not_admin');
      }
    }
    emitParticipants(room);
    const sys = { username: 'system', text: `Власництво кімнати передано користувачу ${username}`, room, time: new Date().toLocaleTimeString(), system: true };
    await Message.create(sys);
    io.to(room).emit('receive_message', sys);
  });

  socket.on('send_message', async (data) => {
    const { username, room, avatarUrl } = socket.data;
    // If user is not present in room's user list, block sending
    try {
      if (!getUsers(room).includes(username)) {
        return socket.emit('error_message', 'Вас видалено з кімнати');
      }
    } catch {}
    const isEncrypted = !!data.ciphertext && !!data.iv;
    const msg = {
      username,
      room,
      avatarUrl,
      time: new Date().toLocaleTimeString(),
      system: false,
      // plaintext fall-back for legacy/guest
      text: isEncrypted ? undefined : data.text,
      ciphertext: isEncrypted ? data.ciphertext : undefined,
      iv: isEncrypted ? data.iv : undefined,
      alg: isEncrypted ? (data.alg || 'AES-GCM') : undefined
    };
    const saved = await Message.create(msg);
    io.to(room).emit('receive_message', saved);
    // Enforce per-room and global message caps
    try {
      const roomCount = await Message.countDocuments({ room });
      if (roomCount > 300) {
        const toDelete = roomCount - 300;
        await Message.find({ room }).sort({ createdAt: 1 }).limit(toDelete).then(async (docs) => {
          const ids = docs.map(d => d._id);
          if (ids.length) await Message.deleteMany({ _id: { $in: ids } });
        });
      }
      const totalCount = await Message.estimatedDocumentCount();
      if (totalCount > 30000) {
        const toDelete = totalCount - 30000;
        await Message.find({}).sort({ createdAt: 1 }).limit(toDelete).then(async (docs) => {
          const ids = docs.map(d => d._id);
          if (ids.length) await Message.deleteMany({ _id: { $in: ids } });
        });
      }
    } catch (e) {
      console.warn('[cap] prune error', e.message);
    }
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
    emitParticipants(room);

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

async function emitParticipants(room, targetSocketId) {
  try {
    const sockets = await io.in(room).fetchSockets();
    const usersSet = new Set(getUsers(room));
    const enriched = Array.from(usersSet).map((u) => {
      const sock = sockets.find(s => s.data?.username === u);
      const isGuest = !(sock && sock.data && sock.data.userId);
      return { name: u, isGuest };
    });
    const payload = { users: enriched, owner: getRoomCreatorName(room) };
    if (targetSocketId) {
      io.to(targetSocketId).emit('participants_update', payload);
    } else {
      io.to(room).emit('participants_update', payload);
    }
  } catch (e) {
    io.to(targetSocketId || room).emit('participants_update', { users: getUsers(room).map(n => ({ name: n, isGuest: true })), owner: getRoomCreatorName(room) });
  }
}
});
server.listen(3001, () => console.log('Сервер запущено на порту 3001'));