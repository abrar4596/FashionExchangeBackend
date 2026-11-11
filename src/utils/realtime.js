const publishRealtimeEvent = (req, eventName, userIds = [], data = {}) => {
  const io = req.app.get('io');
  if (!io) return;

  const event = {
    ...data,
    occurredAt: new Date().toISOString(),
  };
  const rooms = [...new Set(userIds.filter(Boolean).map((id) => `user_${id}`))];

  let broadcast = io.to('admin_room');
  for (const room of rooms) {
    broadcast = broadcast.to(room);
  }
  broadcast.emit(eventName, event);
};

module.exports = { publishRealtimeEvent };
