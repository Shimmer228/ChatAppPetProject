const rooms = {}; // код_кімнати: { creatorId, creatorName, password, users: [] }

function createRoom(code, socketId, name, password) {
  rooms[code] = {
    creatorId: socketId,
    creatorName: name,
    password,
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

function deleteRoom(code) {
  delete rooms[code];
}

function checkPassword(code, password) {
  return rooms[code]?.password === password;
}

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
  deleteRoom,
  checkPassword,
  isUsernameTaken,
  addUserToRoom,
  removeUserFromRoom
};