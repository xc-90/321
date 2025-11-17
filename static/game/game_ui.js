const GameUI = {
    playerArea: document.getElementById('player-display-area'),
    timerDisplay: document.getElementById('timer-display'),
    phaseDisplay: document.getElementById('phase-display'),
    myScoreDisplay: document.getElementById('my-score-display'),
    mainContent: document.getElementById('main-content-area'),
    hostView: document.getElementById('host-view'),
    playerView: document.getElementById('player-view'),
    resultsView: document.getElementById('results-view'),
    waitingView: document.getElementById('waiting-view'),
    gameOverView: document.getElementById('game-over-view'),
    questionGrid: document.getElementById('question-selection-grid'),
    playerQuestionText: document.getElementById('player-question-text'),
    contestantArea: document.getElementById('contestant-answer-area'),
    audienceArea: document.getElementById('audience-answer-area'),
    audienceOptionsGrid: document.getElementById('audience-options-grid'),
    votingArea: document.getElementById('voting-area'),
    votingOptionsContainer: document.getElementById('voting-options-container'),
    contestantAnswerInput: document.getElementById('contestant-answer-input'),
    studentChat: document.getElementById('student-chat-container'),
    
    showView(viewToShow) {
        [this.hostView, this.playerView, this.resultsView, this.waitingView, this.gameOverView].forEach(view => {
            if (view) view.classList.add('hidden');
        });
        if (viewToShow) {
            viewToShow.classList.remove('hidden');
            console.log('Showing view:', viewToShow.id);
        }
    },

    updatePlayerList(players, contestants = []) {
        this.playerArea.innerHTML = '';
        const contestantSids = contestants.map(c => c.sid);

        if (contestantSids.length === 2) {
            contestants.forEach((player, index) => {
                const circle = document.createElement('div');
                circle.className = 'player-circle is-contestant';
                circle.style.backgroundColor = player.color;
                circle.textContent = player.username.substring(0, 1).toUpperCase();
                circle.title = player.username;
                
                if (index === 0) {
                    circle.style.left = '30%';
                } else if (index === 1) {
                    circle.style.left = '70%';
                }
                circle.style.top = '50%';
                circle.style.transform = 'translateY(-50%)';
                
                this.playerArea.appendChild(circle);
            });
        }
    },

    updateTimer(time, phase) {
        this.timerDisplay.textContent = `0:${time.toString().padStart(2, '0')}`;
        this.phaseDisplay.textContent = phase;
    },

    updateMyScore(score) {
        if (this.myScoreDisplay && !GameState.isHost) {
            this.myScoreDisplay.textContent = `Your Score: ${score}`;
        }
    },

    setupHostDashboard(questions, usedQuestionIds) {
        console.log('Setting up host dashboard');
        this.showView(this.hostView);
        this.questionGrid.innerHTML = '';
        
        if (this.myScoreDisplay) {
            this.myScoreDisplay.style.display = 'none';
        }
        
        questions.forEach(q => {
            const card = document.createElement('div');
            card.className = 'question-card';
            card.dataset.questionId = q.id;
            card.innerHTML = `<h4>Question ${q.id}</h4>`;
            
            if (usedQuestionIds.includes(q.id)) {
                card.classList.add('used');
                card.style.pointerEvents = 'none';
            } else {
                card.onclick = () => GameMain.selectQuestion(q.id);
            }
            this.questionGrid.appendChild(card);
        });
    },
    
    displayNewRound(data) {
        console.log('Displaying new round. My role:', GameState.myRole);
        console.log('Question:', data.question);
        console.log('Contestants:', data.contestants);
        
        this.showView(this.playerView);
        this.contestantArea.classList.add('hidden');
        this.audienceArea.classList.add('hidden');
        this.votingArea.classList.add('hidden');
        this.playerQuestionText.textContent = data.question;

        if (GameState.myRole === 'contestant') {
            console.log('Setting up contestant interface');
            this.contestantArea.classList.remove('hidden');
            this.contestantAnswerInput.value = '';
            this.contestantAnswerInput.disabled = false;
            const submitBtn = this.contestantArea.querySelector('button');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Submit Answer';
            }
        } else if (GameState.myRole === 'audience') {
            console.log('Setting up audience interface');
            this.audienceArea.classList.remove('hidden');
            this.audienceOptionsGrid.innerHTML = '';
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
                this.audienceOptionsGrid.appendChild(btn);
            });
        }
    },

    transitionToVoting(contestantAnswers) {
        console.log('=== TRANSITION TO VOTING ===');
        console.log('My role:', GameState.myRole);
        console.log('Contestant answers:', contestantAnswers);
        
        this.contestantArea.classList.add('hidden');
        this.audienceArea.classList.add('hidden');
        
        if (GameState.myRole === 'audience') {
            console.log('Setting up voting interface for audience');
            this.votingArea.classList.remove('hidden');
            this.votingOptionsContainer.innerHTML = '';
            
            if (!contestantAnswers || Object.keys(contestantAnswers).length === 0) {
                this.votingOptionsContainer.innerHTML = '<p>No answers were submitted by contestants</p>';
                return;
            }

            Object.entries(contestantAnswers).forEach(([sid, data]) => {
                console.log('Creating vote card for:', data.username, 'SID:', sid);
                
                const voteCard = document.createElement('div');
                voteCard.className = 'vote-card';
                
                const titleEl = document.createElement('h4');
                titleEl.textContent = data.username;
                voteCard.appendChild(titleEl);
                
                const answerText = document.createElement('div');
                answerText.className = 'answer-text';
                answerText.textContent = data.answer;
                voteCard.appendChild(answerText);
                
                const voteButton = document.createElement('button');
                voteButton.textContent = `Vote for ${data.username}`;
                voteButton.disabled = false;
                voteButton.onclick = () => {
                    console.log('User clicked vote button for:', data.username, 'SID:', sid);
                    GameMain.submitVote(sid);
                };
                voteCard.appendChild(voteButton);
                
                this.votingOptionsContainer.appendChild(voteCard);
            });
        } else if (GameState.myRole === 'contestant') {
            console.log('Contestant waiting for votes');
            this.playerQuestionText.textContent = "Waiting for the audience to vote...";
            this.votingArea.classList.add('hidden');
        }
    },

    disableAllInputs() {
        console.log('Disabling all inputs');
        document.querySelectorAll('#player-view button, #player-view textarea').forEach(el => {
            el.disabled = true;
        });
    },

    showResults(data) {
        console.log('Showing results:', data);
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
                <p class="answer-text">"<em>${answerData.answer}</em>"</p>
                <p class="votes">Received ${answerData.votes} vote${answerData.votes !== 1 ? 's' : ''}.</p>
            `;
            resultsContainer.appendChild(card);
        }
    },
    
    prepareForNextRound() {
        console.log('Preparing for next round');
        if (GameState.isHost) {
            this.showView(this.hostView);
        } else {
            this.showView(this.waitingView);
        }
    },

    showGameOver(gameOverData) {
        console.log('Showing game over screen with data:', gameOverData);
        
        this.playerArea.innerHTML = '';
        this.playerArea.style.display = 'none';
        
        this.showView(this.gameOverView);
        const finalScoreboard = document.getElementById('final-scoreboard');
        finalScoreboard.innerHTML = '';
        
        const winnerContainer = document.createElement('div');
        winnerContainer.className = 'winner-container';
        
        if (gameOverData.is_tie) {
            const sadFace = document.createElement('div');
            sadFace.className = 'sad-face';
            sadFace.textContent = ':(';
            winnerContainer.appendChild(sadFace);
            
            const title = document.createElement('h2');
            title.textContent = "It's a Tie!";
            title.style.color = '#888';
            winnerContainer.appendChild(title);
            
            if (gameOverData.winners && gameOverData.winners.length > 0) {
                const tieMessage = document.createElement('p');
                tieMessage.className = 'tie-message';
                const names = gameOverData.winners.map(w => w.username).join(', ');
                tieMessage.textContent = `${names} tied with ${gameOverData.winners[0].score} points each`;
                winnerContainer.appendChild(tieMessage);
                
                const tiedCirclesContainer = document.createElement('div');
                tiedCirclesContainer.className = 'tied-circles-container';
                
                gameOverData.winners.forEach(winner => {
                    const circle = document.createElement('div');
                    circle.className = 'tied-circle';
                    circle.style.backgroundColor = winner.color;
                    circle.textContent = winner.username.substring(0, 1).toUpperCase();
                    tiedCirclesContainer.appendChild(circle);
                });
                
                winnerContainer.appendChild(tiedCirclesContainer);
            } else {
                const tieMessage = document.createElement('p');
                tieMessage.className = 'tie-message';
                tieMessage.textContent = 'Nobody wins!';
                winnerContainer.appendChild(tieMessage);
            }
        } else {
            const trophy = document.createElement('div');
            trophy.className = 'trophy-icon';
            trophy.textContent = '🏆';
            winnerContainer.appendChild(trophy);
            
            const title = document.createElement('h2');
            title.textContent = 'Winner!';
            winnerContainer.appendChild(title);
            
            const giantCircle = document.createElement('div');
            giantCircle.className = 'winner-circle';
            giantCircle.style.backgroundColor = gameOverData.winner.color;
            giantCircle.textContent = gameOverData.winner.username.substring(0, 1).toUpperCase();
            winnerContainer.appendChild(giantCircle);
            
            const winnerName = document.createElement('h3');
            winnerName.className = 'winner-name';
            winnerName.textContent = gameOverData.winner.username;
            winnerContainer.appendChild(winnerName);
            
            const winnerScore = document.createElement('p');
            winnerScore.className = 'winner-score';
            winnerScore.textContent = `${gameOverData.winner.score} points`;
            winnerContainer.appendChild(winnerScore);
        }
        
        const redirectMessage = document.createElement('p');
        redirectMessage.className = 'redirect-message';
        redirectMessage.textContent = 'Redirecting to home in 20 seconds...';
        winnerContainer.appendChild(redirectMessage);
        
        finalScoreboard.appendChild(winnerContainer);
        
        setTimeout(() => {
            window.location.href = '/';
        }, 20000);
    },

    addChatMessage(data) {
        const messages = document.getElementById('chat-messages');
        if (!messages) {
            console.warn('Chat messages container not found');
            return;
        }
        
        const msgEl = document.createElement('div');
        msgEl.className = 'chat-message';
        
        const userSpan = document.createElement('span');
        userSpan.className = 'user';
        userSpan.textContent = `${data.user}: `;
        userSpan.style.color = data.color;
        
        msgEl.appendChild(userSpan);
        msgEl.appendChild(document.createTextNode(data.text));
        
        messages.appendChild(msgEl);
        messages.scrollTop = messages.scrollHeight;
        
        console.log('Chat message added:', data.user, data.text);
    }
};