const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// Храним пользователей и сообщения в памяти (пока без базы данных)
const users = {};      // { socketId: { username, avatar } }
const messages = {};   // { roomId: [ {from, text, time, unread} ] }
const rooms = {
    'general': { name: 'Общий чат', members: [] },
};

io.on('connection', (socket) => {
    console.log('Подключился:', socket.id);

    // Регистрация пользователя
    socket.on('register', ({ username }) => {
        users[socket.id] = { username, id: socket.id };
        socket.emit('registered', { id: socket.id, username });
        io.emit('users_update', Object.values(users));
        console.log('Зарегистрирован:', username);
    });

    // Войти в комнату
    socket.on('join_room', (roomId) => {
        socket.join(roomId);
        if (!messages[roomId]) messages[roomId] = [];
        socket.emit('message_history', messages[roomId]);
    });

    // Отправить сообщение
    socket.on('send_message', ({ roomId, text }) => {
        const user = users[socket.id];
        if (!user) return;

        const msg = {
            id: Date.now(),
            from: user.username,
            fromId: socket.id,
            text,
            time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
            unread: Object.keys(io.sockets.adapter.rooms.get(roomId) || {}).length - 1
        };

        if (!messages[roomId]) messages[roomId] = [];
        messages[roomId].push(msg);

        io.to(roomId).emit('new_message', { roomId, msg });
    });

    // Прочитал сообщение
    socket.on('read_message', ({ roomId, msgId }) => {
        const roomMsgs = messages[roomId];
        if (!roomMsgs) return;
        const msg = roomMsgs.find(m => m.id === msgId);
        if (msg && msg.unread > 0) {
            msg.unread--;
            io.to(roomId).emit('message_read', { roomId, msgId, unread: msg.unread });
        }
    });

    // Печатает...
    socket.on('typing', ({ roomId }) => {
        const user = users[socket.id];
        if (user) socket.to(roomId).emit('user_typing', { username: user.username });
    });

    // Отключился
    socket.on('disconnect', () => {
        console.log('Отключился:', users[socket.id]?.username);
        delete users[socket.id];
        io.emit('users_update', Object.values(users));
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Сервер Haru запущен на http://localhost:${PORT}`);
});