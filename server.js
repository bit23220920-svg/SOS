const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// Main landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// User/Citizen App Page
app.get('/user', (req, res) => {
  res.sendFile(path.join(__dirname, 'user.html'));
});

// G-Force Admin Dispatcher Page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Get IP address endpoint
app.get('/api/get-ip', (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  res.json({ ip: clientIp });
});

// Socket.io Real-Time Event Communication
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // When citizen triggers SOS
  socket.on('TRIGGER_SOS', (data) => {
    console.log('🚨 SOS RECEIVED FROM USER:', data.name);
    // Send alert ONLY to G-Force Admin Dashboard
    io.emit('NEW_DISPATCH_ALERT', data);
  });

  // Streaming real-time GPS coordinates
  socket.on('UPDATE_LOCATION', (data) => {
    io.emit('LOCATION_UPDATED', data);
  });
});

const port = process.env.PORT || 3000;

server.listen(port, () => {
  console.log('Server running!');
  console.log(`📱 Citizen View: http://localhost:${port}/user`);
  console.log(`🛡️ G-Force Admin: http://localhost:${port}/admin`);
});