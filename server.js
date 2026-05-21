const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { isTeamAvailable } = require('./teamValidator');
const rawPlayersData = require('./data/players.json');
const playersDataArray = Array.isArray(rawPlayersData) ? rawPlayersData : (rawPlayersData.players || []);
const playersData = playersDataArray.map(p => ({
    name: p.name,
    role: p.role || 'Player',
    country: p.country || 'Unknown',
    basePrice: p.basePrice || p.base_price_lakhs || 100,
    stats: p.stats || "-"
}));

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function getSortedAndShuffledPlayers() {
    const groups = {};
    playersData.forEach(p => {
        if (!groups[p.basePrice]) groups[p.basePrice] = [];
        groups[p.basePrice].push(p);
    });

    const sortedPrices = Object.keys(groups).map(Number).sort((a, b) => b - a);

    let result = [];
    for (const price of sortedPrices) {
        result = result.concat(shuffleArray(groups[price]));
    }
    return result;
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function processSale(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    if (room.gameState.highestBidder) {
        const winnerId = room.gameState.highestBidder;
        const price = room.gameState.currentBid;
        room.users[winnerId].budget -= price;
        room.users[winnerId].playersBought.push({
            name: room.gameState.players[room.gameState.currentPlayerIndex].name,
            role: room.gameState.players[room.gameState.currentPlayerIndex].role,
            price: price
        });
    } else {
        room.gameState.unsoldPlayers.push(room.gameState.players[room.gameState.currentPlayerIndex]);
    }

    room.gameState.status = 'sold';
    io.to(roomCode).emit('playerSold', {
        player: room.gameState.players[room.gameState.currentPlayerIndex],
        winner: room.gameState.highestBidder ? room.users[room.gameState.highestBidder] : null,
        price: room.gameState.currentBid,
        users: Object.values(room.users),
        gameState: room.gameState
    });

    setTimeout(() => {
        room.gameState.currentPlayerIndex++;
        if (room.gameState.currentPlayerIndex >= room.gameState.players.length) {
            room.gameState.status = 'finished';
            io.to(roomCode).emit('auctionFinished');
        } else {
            room.gameState.status = 'auctioning';
            room.gameState.currentBid = room.gameState.players[room.gameState.currentPlayerIndex].basePrice;
            room.gameState.highestBidder = null;
            io.to(roomCode).emit('nextPlayer', room.gameState);
            startTimer(roomCode);
        }
    }, 1500);
}

function startTimer(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    if (room.timerInterval) {
        clearTimeout(room.timerInterval);
    }

    room.gameState.timerEndTime = Date.now() + 10000;
    io.to(roomCode).emit('timerUpdate', room.gameState.timerEndTime);

    room.timerInterval = setTimeout(() => {
        processSale(roomCode);
    }, 10000);
}

io.on('connection', (socket) => {
    socket.on('createRoom', ({ name, sport, team }) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            host: socket.id,
            sport,
            timerInterval: null,
            users: {
                [socket.id]: { name, team, budget: 12000, id: socket.id, playersBought: [] }
            },
            gameState: {
                status: 'lobby',
                players: getSortedAndShuffledPlayers(),
                currentPlayerIndex: 0,
                currentBid: 0,
                highestBidder: null,
                timerEndTime: null,
                unsoldPlayers: []
            }
        };
        socket.join(roomCode);
        socket.emit('roomCreated', roomCode);
        io.to(roomCode).emit('updateRoom', Object.values(rooms[roomCode].users));
    });

    socket.on('joinRoom', ({ name, team, roomCode }) => {
        roomCode = roomCode.toUpperCase();
        if (rooms[roomCode]) {
            if (!isTeamAvailable(rooms[roomCode], team)) {
                return socket.emit('error', 'This team is already selected by someone else in the room. Please choose another.');
            }
            rooms[roomCode].users[socket.id] = { name, team, budget: 12000, id: socket.id, playersBought: [] };
            socket.join(roomCode);
            socket.emit('joinedRoom', { roomCode, gameState: rooms[roomCode].gameState });
            io.to(roomCode).emit('updateRoom', Object.values(rooms[roomCode].users));
        } else {
            socket.emit('error', 'Room not found');
        }
    });

    socket.on('startAuction', (roomCode) => {
        if (rooms[roomCode] && rooms[roomCode].host === socket.id && rooms[roomCode].gameState.status === 'lobby') {
            rooms[roomCode].gameState.status = 'auctioning';
            rooms[roomCode].gameState.currentBid = rooms[roomCode].gameState.players[0].basePrice;
            io.to(roomCode).emit('auctionStarted', rooms[roomCode].gameState);
            startTimer(roomCode);
        }
    });

    socket.on('placeBid', ({ roomCode, bidAmount }) => {
        const room = rooms[roomCode];
        if (room && room.gameState.status === 'auctioning') {
            const user = room.users[socket.id];

            if (user && user.budget >= bidAmount && bidAmount > room.gameState.currentBid && room.gameState.highestBidder !== socket.id) {
                room.gameState.currentBid = bidAmount;
                room.gameState.highestBidder = socket.id;

                // Reset timer
                room.gameState.timerEndTime = Date.now() + 10000;
                if (room.timerInterval) {
                    clearTimeout(room.timerInterval);
                }

                io.to(roomCode).emit('bidUpdated', {
                    currentBid: bidAmount,
                    highestBidder: user,
                    gameState: room.gameState
                });
                io.to(roomCode).emit('timerUpdate', room.gameState.timerEndTime);

                room.timerInterval = setTimeout(() => {
                    processSale(roomCode);
                }, 10000);
            }
        }
    });

    socket.on('pauseAuction', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.host === socket.id && room.gameState.status === 'auctioning') {
            room.gameState.status = 'paused';
            if (room.timerInterval) {
                clearTimeout(room.timerInterval);
                room.timerInterval = null;
            }
            room.gameState.pausedRemainingTime = room.gameState.timerEndTime - Date.now();
            io.to(roomCode).emit('auctionPaused', room.gameState);
        }
    });

    socket.on('resumeAuction', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.host === socket.id && room.gameState.status === 'paused') {
            room.gameState.status = 'auctioning';

            const remaining = room.gameState.pausedRemainingTime || 10000;
            room.gameState.timerEndTime = Date.now() + remaining;

            io.to(roomCode).emit('auctionResumed', room.gameState);
            io.to(roomCode).emit('timerUpdate', room.gameState.timerEndTime);

            room.timerInterval = setTimeout(() => {
                processSale(roomCode);
            }, remaining);
        }
    });

    socket.on('disconnect', () => {
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            if (room.users[socket.id]) {
                delete room.users[socket.id];
                io.to(roomCode).emit('updateRoom', Object.values(room.users));
                if (Object.keys(room.users).length === 0) {
                    if (room.timerInterval) clearTimeout(room.timerInterval);
                    delete rooms[roomCode];
                } else if (room.host === socket.id) {
                    room.host = Object.keys(room.users)[0];
                    io.to(room.host).emit('youAreHost');
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
