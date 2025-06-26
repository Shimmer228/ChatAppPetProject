const rooms = {}; // { roomName: { creatorId: socketId, creatorName: username } }

function createRoom(roomName, socketId, username) {
  if (!rooms[roomName]) {
    rooms[roomName] = {
      creatorId: socketId,
      creatorName: username
    };
  }
}

function getRoomCreator(roomName) {
  return rooms[roomName] ? rooms[roomName].creatorId : null;
}

function getRoomCreatorName(roomName) {
  return rooms[roomName] ? rooms[roomName].creatorName : null;
}

function deleteRoom(roomName) {
  if (rooms[roomName]) {
    delete rooms[roomName];
  }
}
module.exports = { createRoom, getRoomCreator, getRoomCreatorName, deleteRoom };
