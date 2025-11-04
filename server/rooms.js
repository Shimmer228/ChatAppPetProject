const rooms = {}; // code: { creatorId, creatorName, name, users: [] }

function createRoom(code, socketId, creatorName, roomName) {
  rooms[code] = {
    creatorId: socketId,
    creatorName,
    name: roomName,
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

module.exports = {
  createRoom,
  getRoom,
  getRoomCreator,
  getRoomCreatorName,
  getRoomName,
  deleteRoom,
  checkPassword,
  isUsernameTaken,
  addUserToRoom,
  removeUserFromRoom
};