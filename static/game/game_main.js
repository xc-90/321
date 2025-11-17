const GameMain = {
    init() {
        GameState.socket = io();
        this.bindSocketEvents();
        this.bindDOMEvents();

        GameState.socket.on('connect', () => {
            console.log('Socket connected:', GameState.socket.id);
            GameState.mySid = GameState.socket.id;
            
            const isHostReferrer = document.referrer.includes(`/host/${GAME_CODE}`);
            
            const hostToken = localStorage.getItem(`host_token_${GAME_CODE}`);
            const username = localStorage.getItem(`username_${GAME_CODE}`);

            let announcementPayload = { game_code: GAME_CODE };

            if (isHostReferrer && hostToken) {
                announcementPayload.host_token = hostToken;
                console.log('Announcing as host');
            } else if (username) {
                announcementPayload.username = username;
                console.log('Announcing as player:', username);
            } else {
                alert('Please rejoin the game.');
                window.location.href = '/join';
                return;
            }
            GameState.socket.emit('announce_in_game', announcementPayload);
        });
    },

    bindSocketEvents() {
        const socket = GameState.socket;

        socket.on('identity_confirmed', (data) => {
            console.log('Identity confirmed:', data);
            GameState.isHost = data.is_host;
            GameState.myUsername = data.username;
            GameState.myColor = data.color || '#FFFFFF';
            GameState.players = data.players;
            GameState.mySid = socket.id;
            
            if (data.my_score !== undefined) {
                GameState.myScore = data.my_score;
                if (!data.is_host) {
                    GameUI.updateMyScore(data.my_score);
                }
            }
            
            GameUI.updatePlayerList(data.players, data.current_contestants || []);

            if (data.is_host) {
                GameUI.setupHostDashboard(data.questions, data.used_question_ids);
            } else {
                GameUI.studentChat.classList.remove('hidden');
                
                console.log('Player game state:', data.game_state);
                
                if (data.game_state === 'answering') {
                    if (data.is_contestant && data.current_question) {
                        console.log('Syncing as contestant in answering phase');
                        GameState.myRole = 'contestant';
                        GameUI.showView(GameUI.playerView);
                        GameUI.playerQuestionText.textContent = data.current_question.question;
                        GameUI.contestantArea.classList.remove('hidden');
                        GameUI.audienceArea.classList.add('hidden');
                        GameUI.votingArea.classList.add('hidden');
                        GameUI.contestantAnswerInput.value = '';
                        GameUI.contestantAnswerInput.disabled = false;
                        const submitBtn = GameUI.contestantArea.querySelector('button');
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.textContent = 'Submit Answer';
                        }
                        GameUI.updatePlayerList(data.players, data.current_contestants);
                    } else if (data.is_audience && data.current_question) {
                        console.log('Syncing as audience in answering phase');
                        GameState.myRole = 'audience';
                        GameUI.showView(GameUI.playerView);
                        GameUI.playerQuestionText.textContent = data.current_question.question;
                        GameUI.audienceArea.classList.remove('hidden');
                        GameUI.contestantArea.classList.add('hidden');
                        GameUI.votingArea.classList.add('hidden');
                        GameUI.audienceOptionsGrid.innerHTML = '';
                        data.current_question.options.forEach((option, index) => {
                            const btn = document.createElement('button');
                            btn.className = 'audience-option-btn';
                            btn.textContent = option;
                            btn.onclick = (e) => {
                                document.querySelectorAll('.audience-option-btn').forEach(b => b.classList.remove('selected'));
                                e.target.classList.add('selected');
                                GameMain.submitAnswer(index);
                                document.querySelectorAll('.audience-option-btn').forEach(b => b.disabled = true);
                            };
                            GameUI.audienceOptionsGrid.appendChild(btn);
                        });
                        GameUI.updatePlayerList(data.players, data.current_contestants);
                    }
                } else {
                    GameUI.showView(GameUI.waitingView);
                }
            }
        });
        
        socket.on('update_player_list', (data) => {
            GameState.players = data.players;
            GameUI.updatePlayerList(data.players);
        });
        
        socket.on('new_round_started', (data) => {
            console.log('=== NEW ROUND STARTED ===');
            console.log('My SID:', GameState.mySid);
            console.log('Contestants:', data.contestants);
            
            const contestantSids = data.contestants.map(c => c.sid);
            const wasContestant = contestantSids.includes(GameState.mySid);
            
            console.log('Am I a contestant?', wasContestant);
            
            GameState.myRole = wasContestant ? 'contestant' : 'audience';
            GameUI.updatePlayerList(GameState.players, data.contestants);
        
        });
        
        socket.on('show_contestant_interface', (data) => {
            console.log('=== SHOWING CONTESTANT INTERFACE ===');
            GameState.myRole = 'contestant';
            
            GameUI.showView(GameUI.playerView);
            GameUI.playerQuestionText.textContent = data.question;
            GameUI.contestantArea.classList.remove('hidden');
            GameUI.audienceArea.classList.add('hidden');
            GameUI.votingArea.classList.add('hidden');
            
            GameUI.contestantAnswerInput.value = '';
            GameUI.contestantAnswerInput.disabled = false;
            
            const submitBtn = GameUI.contestantArea.querySelector('button');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit Answer';
            }
        });
        
        socket.on('show_audience_interface', (data) => {
            console.log('=== SHOWING AUDIENCE INTERFACE ===');
            GameState.myRole = 'audience';
            
            GameUI.showView(GameUI.playerView);
            GameUI.playerQuestionText.textContent = data.question;
            GameUI.audienceArea.classList.remove('hidden');
            GameUI.contestantArea.classList.add('hidden');
            GameUI.votingArea.classList.add('hidden');
            
            GameUI.audienceOptionsGrid.innerHTML = '';
            data.options.forEach((option, index) => {
                const btn = document.createElement('button');
                btn.className = 'audience-option-btn';
                btn.textContent = option;
                btn.disabled = false;
                btn.onclick = (e) => {
                    console.log('Audience selecting option:', index, option);
                    document.querySelectorAll('.audience-option-btn').forEach(b => b.classList.remove('selected'));
                    e.target.classList.add('selected');
                    GameMain.submitAnswer(index);
                    document.querySelectorAll('.audience-option-btn').forEach(b => b.disabled = true);
                };
                GameUI.audienceOptionsGrid.appendChild(btn);
            });
        });

        socket.on('timer_update', (data) => { 
            GameUI.updateTimer(data.time, data.phase); 
        });
        
        socket.on('phase_change', (data) => {
            console.log('=== PHASE CHANGE ===', data.phase);
            if (data.phase === 'voting') {
                if (!GameState.isHost) {
                    console.log('Transitioning to voting, my role:', GameState.myRole);
                    console.log('Answers received:', data.answers);
                    GameUI.transitionToVoting(data.answers);
                }
            } else if (data.phase === 'results') {
                GameUI.disableAllInputs();
            }
        });
        
        socket.on('answer_received', () => {
            console.log('Answer submitted successfully');
        });
        
        socket.on('vote_received', () => {
            console.log('Vote submitted successfully');
            document.querySelectorAll('#voting-options-container button').forEach(b => {
                b.disabled = true;
                if (!b.textContent.includes('✓')) {
                    b.textContent = b.textContent.replace('Vote for', 'Voted for');
                }
            });
        });
        
        socket.on('show_results', (data) => { 
            console.log('=== SHOWING RESULTS ===');
            GameUI.showResults(data); 
        });
        
        socket.on('prepare_for_next_round', () => {
            console.log('=== PREPARING FOR NEXT ROUND ===');
            GameUI.prepareForNextRound(); 
        });
        
        socket.on('game_over', (data) => {
            console.log('=== GAME OVER ===');
            GameUI.showGameOver(data);
        });
        
        socket.on('update_my_score', (data) => {
            console.log('Score updated:', data.score);
            GameState.myScore = data.score;
            if (!GameState.isHost) {
                GameUI.updateMyScore(data.score);
            }
        });
        
        socket.on('new_message', (data) => { 
            console.log('New message:', data);
            GameUI.addChatMessage(data); 
        });
        
        socket.on('question_selected', (data) => {
            console.log('Question selected confirmed:', data.question_id);
            const card = document.querySelector(`.question-card[data-question-id='${data.question_id}']`);
            if (card) {
                card.classList.add('used');
                card.style.pointerEvents = 'none';
            }
        });
        
        socket.on('error', (data) => {
            console.error('Socket error:', data.message);
            if (data.message.includes('closed') || 
                data.message.includes('not found') || 
                data.message.includes('verify your identity')) {
                alert(`Error: ${data.message}`);
                window.location.href = '/';
            } else if (!data.message.includes('already in progress') && 
                       !data.message.includes('already started')) {
                alert(`Error: ${data.message}`);
            }
        });
        
        socket.on('disconnect', () => {
            console.warn('Socket disconnected - attempting to reconnect...');
        });
        
        socket.on('reconnect', () => {
            console.log('Socket reconnected, re-announcing...');
            const isHostReferrer = document.referrer.includes(`/host/${GAME_CODE}`);
            const hostToken = localStorage.getItem(`host_token_${GAME_CODE}`);
            const username = localStorage.getItem(`username_${GAME_CODE}`);
            
            let announcementPayload = { game_code: GAME_CODE };
            if (isHostReferrer && hostToken) {
                announcementPayload.host_token = hostToken;
            } else if (username) {
                announcementPayload.username = username;
            }
            socket.emit('announce_in_game', announcementPayload);
        });
    },

    bindDOMEvents() {
        let lastMessageTime = 0;
        const chatForm = document.getElementById('chat-form');
        const chatInput = document.getElementById('chat-input');
        
        if (chatForm && chatInput) {
            chatForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const now = Date.now();
                
                if (now - lastMessageTime < 1000) {
                    console.log('Chat rate limited');
                    return;
                }
                
                const message = chatInput.value.trim();
                if (message) {
                    console.log('Sending chat message:', message);
                    GameState.socket.emit('send_message', { message: message });
                    chatInput.value = '';
                    lastMessageTime = now;
                }
            });
        }

        const contestantForm = document.getElementById('contestant-answer-form');
        if (contestantForm) {
            contestantForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const input = GameUI.contestantAnswerInput;
                const answer = input.value.trim();
                if (answer) {
                    console.log('Submitting contestant answer:', answer);
                    this.submitAnswer(answer);
                    input.disabled = true;
                    const submitBtn = e.target.querySelector('button');
                    if (submitBtn) {
                        submitBtn.disabled = true;
                        submitBtn.textContent = 'Answer Submitted';
                    }
                }
            });
        }
    },

    selectQuestion(questionId) {
        console.log('Host selecting question:', questionId);
        GameState.socket.emit('teacher_selects_question', { question_id: questionId });
        
    },

    submitAnswer(answer) {
        console.log('Submitting answer:', answer, 'Role:', GameState.myRole);
        GameState.socket.emit('player_submit_answer', { answer: answer });
    },
    
    submitVote(contestantSid) {
        console.log('Submitting vote for contestant SID:', contestantSid);
        GameState.socket.emit('player_submit_vote', { contestant_sid: contestantSid });
        
        const voteButtons = document.querySelectorAll('#voting-options-container button');
        voteButtons.forEach(btn => {
            if (btn.onclick && btn.onclick.toString().includes(contestantSid)) {
                btn.textContent = btn.textContent.replace('Vote for', 'Voted for ✓');
                btn.style.backgroundColor = '#4ECDC4';
                btn.style.color = '#000';
            }
        });
    }
};

window.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing game...');
    GameMain.init();
});