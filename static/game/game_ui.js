const GameUI = {
    playerArea: document.getElementById('player-display-area'),
    timerDisplay: document.getElementById('timer-display'),
    phaseDisplay: document.getElementById('phase-display'),
    mainContent: document.getElementById('main-content-area'),
    hostView: document.getElementById('host-view'),
    playerView: document.getElementById('player-view'),
    resultsView: document.getElementById('results-view'),
    waitingView: document.getElementById('waiting-view'),
    questionGrid: document.getElementById('question-selection-grid'),
    teacherHelpContainer: document.getElementById('teacher-help-container'),
    teacherHelpInput: document.getElementById('teacher-help-input'),
    wordCountDisplay: document.getElementById('word-count'),
    playerQuestionText: document.getElementById('player-question-text'),
    contestantArea: document.getElementById('contestant-answer-area'),
    audienceArea: document.getElementById('audience-answer-area'),
    audienceOptionsGrid: document.getElementById('audience-options-grid'),
    votingArea: document.getElementById('voting-area'),
    votingOptionsContainer: document.getElementById('voting-options-container'),
    contestantAnswerInput: document.getElementById('contestant-answer-input'),
    studentChat: document.getElementById('student-chat-container'),
    
    showView(viewToShow) {
        [this.hostView, this.playerView, this.resultsView, this.waitingView].forEach(view => {
            view.classList.add('hidden');
        });
        viewToShow.classList.remove('hidden');
    },

    updatePlayerList(players, contestants = []) {
        this.playerArea.innerHTML = '';
        const contestantSids = contestants.map(c => c.sid);

        players.forEach(player => {
            const circle = document.createElement('div');
            circle.className = 'player-circle';
            circle.style.backgroundColor = player.color;
            circle.textContent = player.username.substring(0, 1).toUpperCase();
            
            if (contestantSids.includes(player.sid)) {
                circle.classList.add('is-contestant');
            } else {
                circle.style.left = `${5 + Math.random() * 90}%`;
                circle.style.top = `${60 + Math.random() * 20}%`;
            }
            this.playerArea.appendChild(circle);
        });
    },

    updateTimer(time, phase) {
        this.timerDisplay.textContent = `0:${time.toString().padStart(2, '0')}`;
        this.phaseDisplay.textContent = phase;
    },

    setupHostDashboard(questions, usedQuestionIds) {
        this.showView(this.hostView);
        this.questionGrid.innerHTML = '';
        questions.forEach(q => {
            const card = document.createElement('div');
            card.className = 'question-card';
            card.dataset.questionId = q.id;
            card.innerHTML = `<h4>Question ${q.id}</h4>`;
            
            if (usedQuestionIds.includes(q.id)) {
                card.classList.add('used');
            } else {
                card.onclick = () => GameMain.selectQuestion(q.id);
            }
            this.questionGrid.appendChild(card);
        });
    },
    
    displayNewRound(data) {
        this.showView(this.playerView);
        this.contestantArea.classList.add('hidden');
        this.audienceArea.classList.add('hidden');
        this.votingArea.classList.add('hidden');
        this.playerQuestionText.textContent = data.question;

        if (GameState.myRole === 'contestant') {
            this.contestantArea.classList.remove('hidden');
            this.contestantAnswerInput.value = '';
            this.contestantAnswerInput.disabled = false;
            this.contestantArea.querySelector('button').disabled = false;
        } else {
            this.audienceArea.classList.remove('hidden');
            this.audienceOptionsGrid.innerHTML = '';
            data.options.forEach((option, index) => {
                const btn = document.createElement('button');
                btn.className = 'audience-option-btn';
                btn.textContent = option;
                btn.onclick = (e) => {
                    document.querySelectorAll('.audience-option-btn').forEach(b => b.classList.remove('selected'));
                    e.target.classList.add('selected');
                    GameMain.submitAnswer(index);
                    document.querySelectorAll('.audience-option-btn').forEach(b => b.disabled = true);
                };
                this.audienceOptionsGrid.appendChild(btn);
            });
        }
    },

    transitionToVoting(contestantAnswers) {
        this.contestantArea.classList.add('hidden');
        this.audienceArea.classList.add('hidden');
        
        if (GameState.myRole === 'audience') {
            this.votingArea.classList.remove('hidden');
            this.votingOptionsContainer.innerHTML = '';
            
            if (Object.keys(contestantAnswers).length === 0) {
                 this.votingOptionsContainer.innerHTML = '<p>No answers were submitted by contestants</p>';
                 return;
            }

            Object.values(contestantAnswers).forEach(data => {
                const voteCard = document.createElement('div');
                voteCard.className = 'vote-card';
                const answerText = document.createElement('div');
                answerText.className = 'answer-text';
                answerText.textContent = data.answer;
                voteCard.innerHTML = `<h4>${data.username}</h4>`;
                voteCard.appendChild(answerText);
                const voteButton = document.createElement('button');
                voteButton.textContent = `Vote for ${data.username}`;
                voteButton.onclick = () => GameMain.submitVote(data.sid);
                voteCard.appendChild(voteButton);
                this.votingOptionsContainer.appendChild(voteCard);
            });
        } else if (GameState.myRole === 'contestant') {
            this.playerQuestionText.textContent = "Waiting for the audience to vote...";
        }
    },

    disableAllInputs() {
        document.querySelectorAll('#player-view button, #player-view textarea').forEach(el => {
            el.disabled = true;
        });
    },

    showResults(data) {
        this.showView(this.resultsView);
        document.getElementById('correct-answer-display').textContent = data.correct_answer;
        
        const resultsContainer = document.getElementById('contestant-results-container');
        resultsContainer.innerHTML = '';
        for (const sid in data.contestant_answers) {
            const answerData = data.contestant_answers[sid];
            const card = document.createElement('div');
            card.className = 'result-card';
            card.innerHTML = `
                <h4>${answerData.username} answered:</h4>
                <p>"<em>${answerData.answer}</em>"</p>
                <p class="votes">Received ${answerData.votes} votes.</p>
            `;
            resultsContainer.appendChild(card);
        }

        const scoreboard = document.getElementById('scoreboard');
        scoreboard.innerHTML = Object.entries(data.scores)
            .sort(([, a], [, b]) => b - a)
            .map(([name, score]) => `<p>${name}: <strong>${score}</strong></p>`)
            .join('');
    },
    
    prepareForNextRound() {
        if (GameState.isHost) {
            this.showView(this.hostView);
            this.teacherHelpContainer.classList.add('hidden');
        } else {
            this.showView(this.waitingView);
        }
    },

    addChatMessage(data) {
        const messages = document.getElementById('chat-messages');
        const msgEl = document.createElement('div');
        msgEl.className = 'chat-message';
        msgEl.innerHTML = `<span class="user" style="color: ${data.color};">${data.user}:</span> ${data.text}`;
        messages.appendChild(msgEl);
        messages.scrollTop = messages.scrollHeight;
    }
};