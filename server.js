const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '10kb' }));

const sessions = new Map();
const sessionCookie = 'sos_session';
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

function getSession(cookieHeader = '') {
  const sessionCookieValue = cookieHeader.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookie}=`));
  if (!sessionCookieValue) return null;
  return sessions.get(sessionCookieValue.slice(sessionCookie.length + 1)) || null;
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${sessionCookie}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`);
}

// Main landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.post('/api/login', (req, res) => {
  const { role } = req.body;
  let account;

  if (role === 'user') {
    const name = String(req.body.name || '').trim();
    const phone = String(req.body.phone || '').trim();
    if (!name || !phone) return res.status(400).json({ error: 'Enter your name and phone number.' });
    account = { role, name: name.slice(0, 100), phone: phone.slice(0, 40) };
  } else if (role === 'admin') {
    const username = String(req.body.username || '');
    const password = String(req.body.password || '');
    if (username !== adminUsername || password !== adminPassword) {
      return res.status(401).json({ error: 'Incorrect admin username or password.' });
    }
    account = { role };
  } else {
    return res.status(400).json({ error: 'Choose a valid account type.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, account);
  setSessionCookie(res, token);
  res.json({ redirect: role === 'admin' ? '/admin' : '/user' });
});

app.get('/api/session', (req, res) => {
  const account = getSession(req.headers.cookie);
  if (!account) return res.status(401).json({ error: 'Please sign in.' });
  res.json(account);
});

app.get('/logout', (req, res) => {
  const cookieHeader = req.headers.cookie || '';
  const sessionCookieValue = cookieHeader.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookie}=`));
  if (sessionCookieValue) {
    const token = sessionCookieValue.slice(sessionCookie.length + 1);
    sessions.delete(token);
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.sessionToken === token) socket.disconnect(true);
    }
  }
  res.setHeader('Set-Cookie', `${sessionCookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.redirect('/');
});

// User/Citizen App Page
app.get('/user', (req, res) => {
  if (getSession(req.headers.cookie)?.role !== 'user') return res.redirect('/');
  res.sendFile(path.join(__dirname, 'user.html'));
});

// G-Force Admin Dispatcher Page
app.get('/admin', (req, res) => {
  if (getSession(req.headers.cookie)?.role !== 'admin') return res.redirect('/');
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Get IP address endpoint
app.get('/api/get-ip', (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  res.json({ ip: clientIp });
});

// Socket.io Real-Time Event Communication
io.use((socket, next) => {
  const sessionCookieValue = (socket.handshake.headers.cookie || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookie}=`));
  const token = sessionCookieValue?.slice(sessionCookie.length + 1);
  const account = token && sessions.get(token);
  if (!account) return next(new Error('Authentication required'));
  socket.data.account = account;
  socket.data.sessionToken = token;
  next();
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Admin dashboards join this room to receive private dispatch updates.
  socket.on('JOIN_ADMIN', () => {
    if (socket.data.account.role === 'admin') socket.join('admins');
  });

  // When citizen triggers SOS
  socket.on('TRIGGER_SOS', (data) => {
    if (socket.data.account.role !== 'user') return;
    const alert = { ...data, name: socket.data.account.name, phone: socket.data.account.phone };
    console.log('SOS RECEIVED FROM USER:', alert.name);
    io.to('admins').emit('NEW_DISPATCH_ALERT', alert);
  });

  // Streaming real-time GPS coordinates
  socket.on('UPDATE_LOCATION', (data) => {
    if (socket.data.account.role !== 'user') return;
    io.to('admins').emit('LOCATION_UPDATED', data);
  });
});

const port = process.env.PORT || 3000;

server.listen(port, () => {
  console.log('Server running!');
  console.log(`Login: http://localhost:${port}/`);
  console.log(`📱 Citizen View: http://localhost:${port}/user`);
  console.log(`🛡️ G-Force Admin: http://localhost:${port}/admin`);
  if (!process.env.ADMIN_PASSWORD) console.log('Demo admin credentials: admin / admin123');
});