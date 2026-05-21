document.addEventListener('DOMContentLoaded', () => {
    const socket = io({ transports: ['websocket', 'polling'] });
    let currentRoom = null;
    let isHost = false;
    let localTimerInterval = null;

    function stopLocalTimer() {
        if (localTimerInterval) {
            clearInterval(localTimerInterval);
            localTimerInterval = null;
        }
    }

    // Audio Elements
    const beepSound = new Audio('Beep.mp3');
    beepSound.loop = true;

    function stopBeep() {
        if (!beepSound.paused) {
            beepSound.pause();
            beepSound.currentTime = 0;
        }
    }

    // UI Elements
    const mainView = document.getElementById('main-view');
    const auctionView = document.getElementById('auction-view');
    const displayRoomCode = document.getElementById('display-room-code');
    const lobbyRoomCode = document.getElementById('lobby-room-code');
    const lobbyContent = document.getElementById('lobby-content');
    const auctionContent = document.getElementById('auction-content');
    const roomStatus = document.getElementById('room-status-badge');
    const roomStatusDot = document.getElementById('room-status-dot');
    const usersList = document.getElementById('users-list');
    const startAuctionBtn = document.getElementById('start-auction-btn');
    const pauseAuctionBtn = document.getElementById('pause-auction-btn');
    const endAuctionBtn = document.getElementById('end-auction-btn');
    const mainBidBtn = document.getElementById('main-bid-btn');
    
    // Player Info Elements
    const playerName = document.getElementById('current-player-name');
    const playerRole = document.getElementById('current-player-role');
    const playerCountry = document.getElementById('current-player-country');
    const playerBase = document.getElementById('current-player-base');
    const bidAmountDisplay = document.getElementById('bid-amount-display');
    const currentBidDisplayTop = document.getElementById('current-bid-display-top');
    const highestBidderName = document.getElementById('highest-bidder-name');
    const auctionTimer = document.getElementById('auction-timer');
    const auctionTimerBox = document.getElementById('auction-timer-box');
    const timerProgress = document.getElementById('timer-progress');
    const myPurse = document.getElementById('my-purse');

    // Modal Elements
    const squadModal = document.getElementById('squad-modal');
    const closeSquadModal = document.getElementById('close-squad-modal');
    const squadModalTitle = document.getElementById('squad-modal-title');
    const squadPlayersCount = document.getElementById('squad-players-count');
    const squadRemainingPurse = document.getElementById('squad-remaining-purse');
    const squadPlayersList = document.getElementById('squad-players-list');
    
    const playersListModal = document.getElementById('players-list-modal');
    const closePlayersListModal = document.getElementById('close-players-list-modal');
    const playersListTitle = document.getElementById('players-list-title');
    const playersListTbody = document.getElementById('players-list-tbody');
    const viewUpcomingBtn = document.getElementById('view-upcoming-btn');
    const viewUnsoldBtn = document.getElementById('view-unsold-btn');
    
    let currentUsers = [];
    let currentGameState = null;

    function formatMoney(lakhs) {
        if (lakhs >= 100) {
            return `₹${lakhs / 100}CR`;
        }
        return `₹${lakhs}L`;
    }

    // Tab Switching for Landing Page
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => {
                b.classList.remove('bg-white', 'text-black', 'active');
                b.classList.add('text-white', 'hover:bg-white/10');
            });
            tabContents.forEach(c => {
                c.classList.remove('active');
                c.classList.add('hidden');
            });
            btn.classList.add('bg-white', 'text-black', 'active');
            btn.classList.remove('text-white', 'hover:bg-white/10');
            const targetId = btn.getAttribute('data-tab') + '-content';
            const targetContent = document.getElementById(targetId);
            if (targetContent) {
                targetContent.classList.add('active');
                targetContent.classList.remove('hidden');
            }
        });
    });

    // Tab Switching for Auction Room
    const roomTabs = document.querySelectorAll('.room-tab[data-target]');
    const roomTabContents = document.querySelectorAll('.tab-content-area');
    roomTabs.forEach(btn => {
        btn.addEventListener('click', () => {
            roomTabs.forEach(b => {
                b.classList.remove('active', 'text-accent-green', 'bg-accent-green/5', 'border-b-2', 'border-accent-green');
                b.classList.add('text-gray-500', 'hover:text-white');
            });
            roomTabContents.forEach(c => {
                c.classList.remove('active');
                c.classList.add('hidden');
            });
            btn.classList.add('active', 'text-accent-green', 'bg-accent-green/5', 'border-b-2', 'border-accent-green');
            btn.classList.remove('text-gray-500', 'hover:text-white');
            const targetId = btn.getAttribute('data-target') + '-tab-content';
            const targetEl = document.getElementById(targetId);
            if(targetEl) {
                targetEl.classList.add('active');
                targetEl.classList.remove('hidden');
            }
        });
    });

    // Team Selection
    function setupTeamSelection(gridId) {
        const teamOptions = document.querySelectorAll(`#${gridId} .team-option`);
        teamOptions.forEach(option => {
            option.addEventListener('click', () => {
                teamOptions.forEach(o => {
                    o.classList.remove('active', 'team-card-active', 'ring-4', 'ring-white');
                });
                option.classList.add('active', 'team-card-active', 'ring-4', 'ring-white');
            });
        });
    }
    setupTeamSelection('host-team-grid');
    setupTeamSelection('join-team-grid');

    // Create Room
    document.getElementById('create-room-btn').addEventListener('click', () => {
        const name = document.getElementById('host-name').value;
        const sport = document.querySelector('.sport-btn.active').innerText.trim();
        const activeTeamEl = document.querySelector('#host-team-grid .team-option.active');
        if (!activeTeamEl) return alert('Please select a franchise');
        const team = activeTeamEl.dataset.team;
        
        if (!name) return alert('Please enter your name');
        
        isHost = true;
        socket.emit('createRoom', { name, sport, team });
    });

    // Join Room
    document.getElementById('join-room-btn').addEventListener('click', () => {
        const roomCode = document.getElementById('room-code').value;
        const name = document.getElementById('join-name').value;
        const activeTeamEl = document.querySelector('#join-team-grid .team-option.active');
        if (!activeTeamEl) return alert('Please select a franchise');
        const team = activeTeamEl.dataset.team;
        
        if (!name || !roomCode) return alert('Please enter code and name');
        
        isHost = false;
        socket.emit('joinRoom', { roomCode, name, team });
    });

    // Socket Listeners
    socket.on('roomCreated', (roomCode) => {
        currentRoom = roomCode;
        showAuctionView(roomCode);
        startAuctionBtn.classList.remove('hidden');
    });

    socket.on('joinedRoom', ({ roomCode, gameState }) => {
        currentRoom = roomCode;
        showAuctionView(roomCode);
        updateGameState(gameState);
    });

    socket.on('updateRoom', (users) => {
        updateUsersList(users);
    });

    socket.on('auctionStarted', (gameState) => {
        roomStatus.innerText = "● Live";
        roomStatus.style.color = "#22c55e";
        if(roomStatusDot) roomStatusDot.style.backgroundColor = "#22c55e";
        startAuctionBtn.classList.add('hidden');
        if (isHost) pauseAuctionBtn.classList.remove('hidden');
        mainBidBtn.classList.remove('hidden');
        auctionTimerBox.classList.remove('hidden');
        highestBidderName.style.display = 'block';
        updateGameState(gameState);
    });

    socket.on('bidUpdated', ({ currentBid, highestBidder, gameState }) => {
        stopBeep();
        if (gameState) currentGameState = gameState;
        const nextBidDisplay = document.getElementById('bid-amount-display');
        if(nextBidDisplay) nextBidDisplay.innerText = formatMoney(currentBid).replace('₹', '');
        if(currentBidDisplayTop) currentBidDisplayTop.innerText = formatMoney(currentBid).replace('₹', '');
        highestBidderName.innerText = `Highest Bid: ${highestBidder.name} (${highestBidder.team})`;
        highestBidderName.style.display = 'block';
        updateNextBidButton();
    });

    function handleTimerUpdate(endTime) {
        stopLocalTimer();
        if (!endTime) return;
        
        function updateDisplay() {
            let timeLeftStr = ((endTime - Date.now()) / 1000).toFixed(1);
            let timeLeft = parseFloat(timeLeftStr);
            if (timeLeft < 0) timeLeft = 0;
            
            auctionTimer.innerText = Math.ceil(timeLeft);
            if (timerProgress) {
                let percentage = (timeLeft / 10) * 100;
                timerProgress.style.width = `${percentage}%`;
            }
            
            if (timeLeft <= 5 && timeLeft > 0) {
                if (beepSound.paused) {
                    beepSound.play().catch(e => console.log("Audio play failed:", e));
                }
            } else {
                stopBeep();
            }

            if (timeLeft <= 3) {
                timerProgress.classList.remove('bg-accent-orange');
                timerProgress.classList.add('bg-red-500');
            } else {
                timerProgress.classList.add('bg-accent-orange');
                timerProgress.classList.remove('bg-red-500');
            }
            
            if (timeLeft <= 0) stopLocalTimer();
        }
        
        updateDisplay();
        localTimerInterval = setInterval(updateDisplay, 100);
    }

    socket.on('timerUpdate', handleTimerUpdate);

    socket.on('playerSold', ({ player, winner, price, users, gameState }) => {
        stopLocalTimer();
        stopBeep();
        if(winner) {
            roomStatus.innerText = `● SOLD to ${winner.team}`;
            roomStatus.style.color = "#22c55e";
            if(roomStatusDot) roomStatusDot.style.backgroundColor = "#22c55e";
        } else {
            roomStatus.innerText = `● UNSOLD`;
            roomStatus.style.color = "#ef4444";
            if(roomStatusDot) roomStatusDot.style.backgroundColor = "#ef4444";
        }
        mainBidBtn.classList.add('hidden');
        auctionTimerBox.classList.add('hidden');
        if (timerProgress) {
            timerProgress.classList.add('bg-accent-orange');
            timerProgress.classList.remove('bg-red-500');
        }
        pauseAuctionBtn.classList.add('hidden');
        if (users) {
            updateUsersList(users);
        }
        if (gameState) {
            currentGameState = gameState;
        }
    });

    socket.on('nextPlayer', (gameState) => {
        stopBeep();
        roomStatus.innerText = "● Live";
        roomStatus.style.color = "#22c55e";
        if(roomStatusDot) roomStatusDot.style.backgroundColor = "#22c55e";
        if (isHost) pauseAuctionBtn.classList.remove('hidden');
        mainBidBtn.classList.remove('hidden');
        auctionTimerBox.classList.remove('hidden');
        updateGameState(gameState);
    });

    socket.on('auctionFinished', () => {
        stopLocalTimer();
        stopBeep();
        roomStatus.innerText = "● Finished";
        roomStatus.style.color = "#a3a3a3";
        if(roomStatusDot) roomStatusDot.style.backgroundColor = "#a3a3a3";
        playerName.innerText = "Auction Ended";
        playerRole.innerText = "-";
        playerBase.innerText = "- L";
        playerCountry.innerText = "-";
        mainBidBtn.classList.add('hidden');
        auctionTimerBox.classList.add('hidden');
        pauseAuctionBtn.classList.add('hidden');
    });

    socket.on('error', (msg) => alert(msg));

    function calculateNextBid(current) {
        if (!current) return 10;
        if (current < 100) return current + 5;
        if (current < 200) return current + 10;
        return current + 20;
    }

    function updateNextBidButton() {
        if (!currentGameState) return;
        
        if (currentGameState.highestBidder === socket.id) {
            mainBidBtn.style.opacity = '0.5';
            mainBidBtn.style.cursor = 'not-allowed';
            mainBidBtn.innerHTML = '<span>LEADING</span>';
        } else {
            mainBidBtn.style.opacity = '1';
            mainBidBtn.style.cursor = 'pointer';
            const nextBid = calculateNextBid(currentGameState.currentBid);
            mainBidBtn.innerHTML = `<span>BID</span> <span class="text-white/90 font-bold" id="bid-amount-display">${formatMoney(nextBid).replace('₹', '')}</span>`;
        }
    }

    let lastBidTime = 0;
    window.placeNextBid = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        
        // Prevent double firing within 300ms from touchstart vs click
        const now = Date.now();
        if (now - lastBidTime < 300) return;
        lastBidTime = now;
        
        if(!currentRoom || !currentGameState) return;
        
        // Prevent bidding against yourself
        if (currentGameState.highestBidder === socket.id) {
            return;
        }
        
        const newBid = calculateNextBid(currentGameState.currentBid);
        
        // Optimistic update for instant button response
        currentGameState.currentBid = newBid;
        currentGameState.highestBidder = socket.id;
        highestBidderName.innerText = "Placing bid...";
        updateNextBidButton();
        
        socket.emit('placeBid', { roomCode: currentRoom, bidAmount: newBid });
    };

    startAuctionBtn.addEventListener('click', () => {
        startAuctionBtn.innerText = "Starting...";
        socket.emit('startAuction', currentRoom);
    });

    pauseAuctionBtn.addEventListener('click', () => {
        if (!currentRoom) return;
        if (pauseAuctionBtn.innerText.includes("Pause")) {
            socket.emit('pauseAuction', currentRoom);
        } else {
            socket.emit('resumeAuction', currentRoom);
        }
    });

    if (endAuctionBtn) {
        endAuctionBtn.addEventListener('click', () => {
            if (!currentRoom) return;
            if (confirm("Are you sure you want to end the auction?")) {
                socket.emit('endAuction', currentRoom);
            }
        });
    }

    socket.on('auctionPaused', (gameState) => {
        stopLocalTimer();
        roomStatus.innerText = "● Paused";
        roomStatus.style.color = "#f59e0b";
        if(roomStatusDot) roomStatusDot.style.backgroundColor = "#f59e0b";
        mainBidBtn.classList.add('hidden');
        if (isHost) {
            pauseAuctionBtn.innerHTML = '▶ Resume';
        }
        stopBeep();
    });

    socket.on('auctionResumed', (gameState) => {
        roomStatus.innerText = "● Live";
        roomStatus.style.color = "#22c55e";
        if(roomStatusDot) roomStatusDot.style.backgroundColor = "#22c55e";
        mainBidBtn.classList.remove('hidden');
        if (isHost) {
            pauseAuctionBtn.innerHTML = '⏸ Pause';
        }
    });

    function showAuctionView(roomCode) {
        mainView.classList.add('hidden');
        auctionView.classList.remove('hidden');
        displayRoomCode.innerText = roomCode;
        if(lobbyRoomCode) lobbyRoomCode.innerText = roomCode;
    }

    function updateGameState(gameState) {
        currentGameState = gameState;
        
        // Update user's personal purse
        if (myPurse && currentRoom && socket.id) {
            const userState = currentUsers.find(u => u.id === socket.id);
            if (userState) myPurse.innerText = formatMoney(userState.budget);
        }

        if (gameState.status === 'lobby') {
            roomStatus.innerText = "Waiting for host...";
            roomStatus.style.color = "#a3a3a3";
            if(roomStatusDot) roomStatusDot.style.backgroundColor = "#a3a3a3";
            if(lobbyContent) lobbyContent.classList.remove('hidden');
            if(auctionContent) auctionContent.classList.add('hidden');
            return;
        } else {
            if(lobbyContent) lobbyContent.classList.add('hidden');
            if(auctionContent) auctionContent.classList.remove('hidden');
        }
        const player = gameState.players[gameState.currentPlayerIndex];
        if (player) {
            playerName.innerText = player.name;
            playerRole.innerText = player.role;
            playerCountry.innerText = player.country || 'International';
            playerBase.innerText = `${player.basePrice}`;
            
            const bidDisp = document.getElementById('bid-amount-display');
            if(bidDisp) bidDisp.innerText = formatMoney(gameState.currentBid).replace('₹', '');
            if(currentBidDisplayTop) currentBidDisplayTop.innerText = formatMoney(gameState.currentBid).replace('₹', '');
            
            if (gameState.highestBidder) {
                highestBidderName.innerText = "Bid Placed";
                highestBidderName.style.display = 'block';
            } else {
                highestBidderName.innerText = "No bids yet";
                highestBidderName.style.display = 'block';
            }
            
            if (gameState.status === 'auctioning') {
                mainBidBtn.classList.remove('hidden');
                auctionTimerBox.classList.remove('hidden');
                updateNextBidButton();
                if (gameState.timerEndTime) {
                    handleTimerUpdate(gameState.timerEndTime);
                }
            }
        }
    }

    function updateUsersList(users) {
        currentUsers = users;
        const totalSquadCount = document.getElementById('total-squad-count');
        if(totalSquadCount) totalSquadCount.innerText = users.length;
        
        usersList.innerHTML = '';
        users.forEach(user => {
            const userEl = document.createElement('div');
            userEl.className = 'flex items-center justify-between p-3 rounded-lg hover:bg-[#242424] transition-colors cursor-pointer group border border-white/5';
            
            const isMe = user.id === socket.id ? '<span class="text-[10px] font-bold text-yellow-500 bg-yellow-500/10 px-1.5 rounded uppercase ml-1">YOU</span>' : '';
            const isHostBadge = (currentRoom && currentUsers && currentUsers[0] && currentUsers[0].id === user.id) ? '<span class="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-1.5 rounded uppercase ml-1">HOST</span>' : '';
            
            const teamClass = `team-${user.team.toLowerCase()}`;
            
            userEl.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="${teamClass} w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold border border-white/20 text-white">${user.team}</div>
                    <div>
                        <div class="flex items-center gap-1">
                            <span class="font-bold text-sm">${user.name}</span>
                            ${isMe}
                            ${isHostBadge}
                        </div>
                        <p class="text-[10px] text-gray-500">${user.playersBought ? user.playersBought.length : 0} players</p>
                    </div>
                </div>
                <div class="flex items-center flex-col text-right">
                    <div class="text-accent-green text-sm font-bold">${formatMoney(user.budget)}</div>
                </div>
            `;
            userEl.addEventListener('click', () => showSquadModal(user));
            usersList.appendChild(userEl);
        });
    }

    function showSquadModal(user) {
        squadModalTitle.innerText = `${user.name} (${user.team}) Squad`;
        const bought = user.playersBought || [];
        squadPlayersCount.innerText = bought.length;
        squadRemainingPurse.innerText = formatMoney(user.budget);
        
        squadPlayersList.innerHTML = '';
        if (bought.length === 0) {
            squadPlayersList.innerHTML = `<tr><td colspan="3" class="text-gray-500 text-center py-4">No players bought yet</td></tr>`;
        } else {
            bought.forEach(p => {
                squadPlayersList.innerHTML += `
                    <tr class="hover:bg-white/5 transition break-words">
                        <td class="px-2 sm:px-4 py-2 sm:py-3 rounded-l-lg font-bold">${p.name}</td>
                        <td class="px-2 sm:px-4 py-2 sm:py-3">${p.role}</td>
                        <td class="px-2 sm:px-4 py-2 sm:py-3 rounded-r-lg text-right font-bold text-accent-green">${formatMoney(p.price)}</td>
                    </tr>
                `;
            });
        }
        
        squadModal.classList.remove('hidden');
    }

    closeSquadModal.addEventListener('click', () => {
        squadModal.classList.add('hidden');
    });
    
    squadModal.addEventListener('click', (e) => {
        if (e.target === squadModal) {
            squadModal.classList.add('hidden');
        }
    });

    if(viewUpcomingBtn) {
        viewUpcomingBtn.addEventListener('click', () => {
            if (!currentGameState || !currentGameState.players) return;
            const upcoming = currentGameState.players.slice(currentGameState.currentPlayerIndex + 1);
            playersListTitle.innerText = `Upcoming Players (${upcoming.length})`;
            renderPlayersList(upcoming);
        });
    }

    if(viewUnsoldBtn) {
        viewUnsoldBtn.addEventListener('click', () => {
            if (!currentGameState || !currentGameState.unsoldPlayers) return;
            const unsold = currentGameState.unsoldPlayers;
            playersListTitle.innerText = `Unsold Players (${unsold.length})`;
            renderPlayersList(unsold);
        });
    }

    function renderPlayersList(players) {
        playersListTbody.innerHTML = '';
        if (players.length === 0) {
            playersListTbody.innerHTML = `<tr><td colspan="3" class="text-gray-500 text-center py-4">No players found</td></tr>`;
        } else {
            players.forEach(p => {
                playersListTbody.innerHTML += `
                    <tr class="hover:bg-white/5 transition break-words">
                        <td class="px-2 sm:px-4 py-2 sm:py-3 rounded-l-lg font-bold">${p.name}</td>
                        <td class="px-2 sm:px-4 py-2 sm:py-3">${p.role}</td>
                        <td class="px-2 sm:px-4 py-2 sm:py-3 rounded-r-lg text-right font-bold text-white">${formatMoney(p.basePrice)}</td>
                    </tr>
                `;
            });
        }
        playersListModal.classList.remove('hidden');
    }

    if(closePlayersListModal) {
        closePlayersListModal.addEventListener('click', () => {
            playersListModal.classList.add('hidden');
        });
    }

    if(playersListModal) {
        playersListModal.addEventListener('click', (e) => {
            if (e.target === playersListModal) {
                playersListModal.classList.add('hidden');
            }
        });
    }
});
