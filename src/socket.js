const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const User = require('./models/User');

const attachSocketServer = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'fashion_exchange_fallback_secret_key'
      );
      const user = await User.findById(decoded.id).select('_id role status');
      if (!user || user.status !== 'active') {
        return next(new Error('Authentication required'));
      }

      socket.data.userId = user._id.toString();
      socket.data.role = user.role;
      return next();
    } catch (error) {
      return next(new Error('Authentication required'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user_${socket.data.userId}`);
    if (socket.data.role === 'admin') socket.join('admin_room');
  });

  return io;
};

module.exports = attachSocketServer;
