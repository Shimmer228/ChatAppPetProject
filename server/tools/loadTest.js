const { io } = require('socket.io-client');
const mongoose = require('mongoose');
const Message = require('../models/message');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/chatdb';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function logStats(label) {
  const total = await Message.estimatedDocumentCount();
  const byRoom = await Message.aggregate([
    { $group: { _id: '$room', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 }
  ]);
  console.log(`[stats] ${label} total=${total} topRooms=${JSON.stringify(byRoom)}`);
}

async function getAuthToken() {
  const uname = `loaduser_${Date.now()}`;
  const body = { username: uname, password: 'loadpass123' };
  try {
    const reg = await fetch(`${SERVER_URL}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await reg.json();
    if (reg.ok && data.token) return data.token;
  } catch {}
  // fallback to login with same creds if registration failed
  const login = await fetch(`${SERVER_URL}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const ldata = await login.json();
  if (login.ok && ldata.token) return ldata.token;
  throw new Error('Could not acquire auth token');
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('[load] connected to mongo');

  const token = await getAuthToken();
  console.log('[load] acquired token');
  const socket = io(SERVER_URL, { autoConnect: false, auth: { token } });
  socket.connect();
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('socket connect timeout')), 5000);
    socket.once('connect', () => { clearTimeout(t); res(); });
    socket.once('connect_error', rej);
  });
  console.log('[load] socket connected');

  let roomCode = '';
  socket.on('room_metadata', ({ code }) => { roomCode = code; });
  socket.on('error_message', (m) => console.log('[error]', m));
  socket.on('receive_message', () => {});

  // Create a room (requires auth)
  socket.emit('create_room', { name: 'LoadOwner', roomName: 'Load Test Room' });
  await sleep(1000);
  if (!roomCode) throw new Error('No room code received');
  console.log('[load] room code', roomCode);

  // Join a sender client
  const sender = io(SERVER_URL);
  await new Promise((res, rej) => {
    sender.once('connect', res);
    sender.once('connect_error', rej);
  });
  sender.emit('join_room', { name: 'LoadSender', code: roomCode });
  await sleep(1000);

  // Baseline: 1 msg/sec for 60s
  console.log('[load] baseline start (1 msg/s x 60s)');
  for (let i = 0; i < 60; i++) {
    sender.emit('send_message', { text: `baseline ${i}` });
    if (i % 10 === 0) await logStats(`baseline tick ${i}`);
    await sleep(1000);
  }
  await logStats('baseline end');

  // Peak: 10 msg/sec for up to 60s, then rest 60s; repeat 2 cycles
  for (let cycle = 1; cycle <= 2; cycle++) {
    console.log(`[load] peak cycle ${cycle} start (10 msg/s x 60s)`);
    const start = Date.now();
    let sent = 0;
    while (Date.now() - start < 60000) {
      for (let j = 0; j < 10; j++) {
        sender.emit('send_message', { text: `peak${cycle} ${sent++}` });
      }
      await sleep(1000);
      if (sent % 100 === 0) await logStats(`peak cycle ${cycle} sent ${sent}`);
    }
    await logStats(`peak cycle ${cycle} end`);
    console.log('[load] cooldown 60s');
    await sleep(60000);
  }

  console.log('[load] done');
  process.exit(0);
}

run().catch((e) => { console.error('[load] error', e); process.exit(1); });


