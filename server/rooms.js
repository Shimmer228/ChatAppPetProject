const rooms = {}; // code: { creatorId, creatorName, name, nameEnc, users: [] }

function createRoom(code, socketId, creatorName, roomName) {
  rooms[code] = {
    creatorId: socketId,
    creatorName,
    name: roomName,
    nameEnc: null,
    users: []
  };
}

function getRoom(code) {
  return rooms[code];
}

function getRoomCreator(code) {
  return rooms[code]?.creatorId;
}

function getRoomCreatorName(code) {
  return rooms[code]?.creatorName || 'Невідомо';
}

function getRoomName(code) {
  return rooms[code]?.name || '';
}

function getRoomNameEnc(code) {
  return rooms[code]?.nameEnc || null;
}

function setRoomNameEnc(code, nameEnc) {
  if (!rooms[code]) return;
  rooms[code].nameEnc = nameEnc;
}

function deleteRoom(code) {
  delete rooms[code];
}

// password is no longer used; code itself is the secret
function checkPassword() { return true; }

function isUsernameTaken(code, name) {
  return rooms[code]?.users.includes(name);
}

function addUserToRoom(code, name) {
  if (!rooms[code]) return;
  if (!rooms[code].users.includes(name)) {
    rooms[code].users.push(name);
  }
}

function removeUserFromRoom(code, name) {
  if (!rooms[code]) return;
  rooms[code].users = rooms[code].users.filter((u) => u !== name);
}

function getUsers(code) {
  return rooms[code]?.users || [];
}

function setRoomCreator(code, socketId, creatorName) {
  if (!rooms[code]) return;
  rooms[code].creatorId = socketId;
  rooms[code].creatorName = creatorName;
}

function getRoomsCount() {
  return Object.keys(rooms).length;
}

module.exports = {
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
  setRoomNameEnc,
  getRoomsCount
};