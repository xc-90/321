const GameMain = {
    init() {
        GameState.socket = io();
        this.bindSocketEvents();
        this.bindDOMEvents();

        GameState.socket.on('connect', () => {
            GameState.mySid = GameState.socket.id;
            
            const isHostReferrer = document.referrer.includes(`/host/${GAME_CODE}`);
            
            const hostToken = localStorage.getItem(`host_token_${GAME_CODE}`);
            const username = localStorage.getItem(`username_${GAME_CODE}`);

            let announcementPayload = { game_code: GAME_CODE };

            if (isHostReferrer && hostToken) {
                announcementPayload.host_token = hostToken;
            } else if (username) {
                announcementPayload.username = username;
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
            GameState.isHost = data.is_host;
            GameState.myUsername = data.username;
            GameState.myColor = data.color || '#FFFFFF';
            GameState.players = data.players;
            
            GameUI.updatePlayerList(Object.values(data.players));

            if (data.is_host) {
                GameUI.setupHostDashboard(data.questions, data.used_question_ids);
            } else {
                GameUI.studentChat.classList.remove('hidden');
                GameUI.showView(GameUI.waitingView);
            }
        });
        
        socket.on('update_player_list', (data) => {
            GameState.players = data.players;
            GameUI.updatePlayerList(Object.values(GameState.players));
        });
        
        socket.on('new_round_started', (data) => {
            const contestantSids = data.contestants.map(c => c.sid);
            GameState.myRole = contestantSids.includes(GameState.mySid) ? 'contestant' : 'audience';
            GameUI.updatePlayerList(Object.values(GameState.players), data.contestants);
            if (!GameState.isHost) {
                GameUI.displayNewRound(data);
            }
        });

        socket.on('timer_update', (data) => { GameUI.updateTimer(data.time, data.phase); });
        socket.on('phase_change', (data) => {
         if (data.phase === 'voting') {
        if (!GameState.isHost) {
            GameUI.transitionToVoting(data.answers);
        }
    } else if (data.phase === 'results') {
        GameUI.disableAllInputs();
    }
});
        socket.on('answer_received', () => {
        });
        socket.on('show_results', (data) => { GameUI.showResults(data); });
        socket.on('prepare_for_next_round', () => { GameUI.prepareForNextRound(); });
        socket.on('new_message', (data) => { GameUI.addChatMessage(data); });
        
        socket.on('error', (data) => {
            alert(`Error: ${data.message}`);
            if (data.message.includes('closed') || data.message.includes('not found') || data.message.includes('verify your identity')) {
                window.location.href = '/';
            }
        });
    },

    bindDOMEvents() {
        const chatForm = document.getElementById('chat-form');
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('chat-input');
            if (input.value) {
                GameState.socket.emit('send_message', { message: input.value });
                input.value = '';
            }
        });

        const contestantForm = document.getElementById('contestant-answer-form');
        contestantForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = GameUI.contestantAnswerInput;
            this.submitAnswer(input.value);
            input.disabled = true;
            e.target.querySelector('button').disabled = true;
        });
    },

    selectQuestion(questionId) {
        GameState.socket.emit('teacher_selects_question', { question_id: questionId });
        
        const card = document.querySelector(`.question-card[data-question-id='${questionId}']`);
        if (card) {
            card.classList.add('used');
        }
        
        document.querySelectorAll('.question-card').forEach(c => {
            c.style.pointerEvents = 'none';
            if (!c.classList.contains('used')) {
                c.style.opacity = '0.5';
            }
        });
    },

    submitAnswer(answer) {
        GameState.socket.emit('player_submit_answer', { answer: answer });
    },
    
    submitVote(contestantSid) {
        GameState.socket.emit('player_submit_vote', { contestant_sid: contestantSid });
        document.querySelectorAll('#voting-options-container button').forEach(b => b.disabled = true);
    }
};

window.addEventListener('DOMContentLoaded', () => GameMain.init());