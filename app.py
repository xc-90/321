import random
import string
import os
from flask import Flask, render_template, request, session, redirect, url_for
from flask_socketio import SocketIO, emit, join_room, leave_room
import secrets
import time
import json

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", manage_session=True)
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY')
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_HTTPONLY'] = True

try:
    with open('questions.json', 'r') as f:
        QUESTIONS = json.load(f)
except (IOError, json.JSONDecodeError) as e:
    QUESTIONS = []

BAD_WORDS = {'ExampleForNow9291'}
AVATAR_COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FED766', '#F0B3A8',
    '#8A84E2', '#3D405B', '#F2CC8F', '#81B29A', '#E07A5F'
]
games = {}

def generate_game_code():
    while True:
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=3))
        if code not in games:
            return code

def get_game_code_for_sid(sid):
    for code, game_data in games.items():
        if sid in game_data['players'] or sid == game_data.get('host_sid'):
            return code
    return None

def initialize_game_state(game):
    game['state'] = 'lobby'
    game['round'] = 0
    game['questions_used'] = []
    game['current_question'] = None
    game['current_contestants'] = {}
    game['current_audience'] = {}
    game['player_scores'] = {sid: 0 for sid in game['players']}
    game['current_answers'] = {}
    game['current_votes'] = {} 
    game['teacher_help_words_used'] = 0
    game['timer_task'] = None

@app.route('/')
def index(): return render_template('index.html')
@app.route('/join')
def join(): return render_template('join.html')
@app.route('/host')
def host(): return render_template('host.html')
@app.route('/frame')
def frame(): return render_template('frame.html')
@app.route('/ai')
def ai(): return render_template('ai.html')
@app.route('/host/<code>')
def host_lobby(code):
    return render_template('host_lobby.html', game_code=code) if code in games else ("Game not found", 404)
@app.route('/student/<code>/lobby')
def student_lobby(code):
    return render_template('student_lobby.html', game_code=code) if code in games else ("Game not found", 404)
@app.route('/game/code/<code>')
def game_view(code):
    return render_template('game.html', game_code=code) if code in games else ("Game not found", 404)

@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")

@socketio.on('disconnect')
def handle_disconnect():
    game_code = get_game_code_for_sid(request.sid)
    if not game_code: return

    sid = request.sid


    def handle_disconnect_delayed():
        socketio.sleep(2)
        if game_code not in games: return

        game = games[game_code]
        if game.get('state') == 'redirecting':
            return
        if game.get('host_sid') == sid:
            print(f"Game {game_code} ended by host disconnect")
            socketio.emit('error', {'message': 'The game has closed as the host disconnected'}, to=game_code)
            games.pop(game_code, None)
        elif sid in game['players']:
            username = game['players'][sid].get('username', 'A player')
            game['players'].pop(sid, None)
            print(f"{username} ({sid}) left game {game_code}")
            player_list = list(game['players'].values())
            socketio.emit('update_player_list', {'players': player_list}, to=game_code)

    socketio.start_background_task(handle_disconnect_delayed)

@socketio.on('host_game')
def handle_host_game():
    game_code = generate_game_code()
    host_token = secrets.token_urlsafe(32)
    games[game_code] = {
        'host_sid': request.sid, 'host_token': host_token,
        'host_verified': False, 'players': {}
    }
    initialize_game_state(games[game_code])
    join_room(game_code)
    print(f"Game {game_code} created by {request.sid}")
    emit('game_created', {'game_code': game_code, 'host_token': host_token})

@socketio.on('verify_host_token')
def handle_verify_host_token(data):
    game_code = data.get('game_code')
    token = data.get('host_token')
    game = games.get(game_code)
    if not game or token != game.get('host_token'):
        emit('access_denied', {'message': 'Invalid game or token'})
        return

    game['host_sid'] = request.sid
    game['host_verified'] = True
    join_room(game_code)
    player_list = list(game['players'].values())
    emit('host_verified', {'game_code': game_code, 'players': player_list})

@socketio.on('join_game')
def handle_join_game(data):
    game_code = data.get('game_code', '').upper()
    username = data.get('username', '').strip()
    game = games.get(game_code)
    
    if not game or not username:
        emit('error', {'message': 'Invalid game code or username'})
        return
    if any(word in BAD_WORDS for word in username.lower().split()):
        emit('banned', {'message': 'nah'})
        socketio.disconnect(request.sid)
        return

    join_room(game_code)
    color = random.choice(AVATAR_COLORS)
    game['players'][request.sid] = {'username': username, 'color': color, 'sid': request.sid}
    game['player_scores'][request.sid] = 0

    emit('join_success', {'game_code': game_code, 'username': username, 'color': color})
    player_list = list(games[game_code]['players'].values())
    socketio.emit('update_player_list', {'players': player_list}, to=game_code)

@socketio.on('announce_in_game')
def handle_announce_in_game(data):
    game_code = data.get('game_code')
    game = games.get(game_code)
    if not game:
        emit('error', {'message': 'Game not found'})
        return

    host_token = data.get('host_token')
    username = data.get('username')
    
    if host_token and host_token == game.get('host_token'):
        game['host_sid'] = request.sid
        game['host_verified'] = True
        join_room(game_code)
        
        used_ids = game.get('questions_used', [])

        emit('identity_confirmed', {
            'is_host': True,
            'username': 'Teacher',
            'game_state': game['state'],
            'players': list(game['players'].values()),
            'scores': game['player_scores'],
            'questions': QUESTIONS,
            'used_question_ids': used_ids
        })
        return

    elif username:
        join_room(game_code)
        old_sid = None
        player_data = None
        for sid, p_data in list(game['players'].items()):
            if p_data['username'] == username:
                old_sid = sid
                player_data = p_data
                break
        
        if player_data:
            if old_sid and old_sid != request.sid:
                game['players'][request.sid] = game['players'].pop(old_sid)
                
                if old_sid in game['player_scores']:
                    game['player_scores'][request.sid] = game['player_scores'].pop(old_sid)

            game['players'][request.sid]['sid'] = request.sid

            emit('identity_confirmed', {
                'is_host': False, 'username': player_data['username'], 'color': player_data['color'],
                'game_state': game['state'], 'players': list(game['players'].values()),
                'scores': game['player_scores']
            })
            return

    emit('error', {'message': 'You did not create this game'})

@socketio.on('start_game')
def handle_start_game():
    game_code = get_game_code_for_sid(request.sid)
    game = games.get(game_code)
    if not game or game['host_sid'] != request.sid or not game['host_verified']:
        emit('error', {'message': 'Only the host can start the game'})
        return
    if len(game['players']) < 2:
        emit('error', {'message': 'Need at least two players to start'})
        return

    game['state'] = 'redirecting' 
    socketio.emit('redirect_to_game', {'game_code': game_code}, to=game_code)


@socketio.on('teacher_selects_question')
def handle_teacher_selects_question(data):
    game_code = get_game_code_for_sid(request.sid)
    game = games.get(game_code)
    if not game or game['host_sid'] != request.sid: return

    if game.get('timer_task') and not game['timer_task'].dead:
        emit('error', {'message': 'A round is already in progress'})
        return

    question_id = data.get('question_id')
    question = next((q for q in QUESTIONS if q['id'] == question_id), None)
    
    if not question or question_id in game['questions_used']:
        emit('error', {'message': 'Question invalid'})
        return

    all_player_sids = list(game['players'].keys())
    if len(all_player_sids) < 2:
        emit('error', {'message': 'You need at least two players to start a round'})
        socketio.emit('phase_change', {'phase': 'waiting', 'message': 'Waiting for more players...'}, to=game_code)
        return
    
    game['state'] = 'answering'
    game['questions_used'].append(question_id)
    game['current_question'] = question
    game['current_answers'] = {}
    game['current_votes'] = {}
    game['teacher_help_words_used'] = 0

    random.shuffle(all_player_sids)
    contestant_sids = all_player_sids[:2]
    
    game['current_contestants'] = {sid: game['players'][sid] for sid in contestant_sids}
    game['current_audience'] = {sid: game['players'][sid] for sid in all_player_sids if sid not in contestant_sids}
    
    payload = {
        'question': question['question'],
        'options': question['options'],
        'contestants': list(game['current_contestants'].values())
    }
    socketio.emit('new_round_started', payload, to=game_code)
    
    game['timer_task'] = socketio.start_background_task(run_round_timer, game_code)

def run_round_timer(game_code):
    game = games.get(game_code)
    if not game: return

    game['state'] = 'answering'
    for i in range(30, 0, -1):
        socketio.emit('timer_update', {'time': i, 'phase': 'Answering'}, to=game_code)
        socketio.sleep(1)
    game['state'] = 'voting'

    contestant_answers_for_voting = {
        sid: {
            'username': data['username'],
            'sid': sid,
            'answer': game['current_answers'].get(sid, "No answer submitted")
        } for sid, data in game['current_contestants'].items()
    }
    socketio.emit('phase_change', {'phase': 'voting', 'answers': contestant_answers_for_voting}, to=game_code)
    
    for i in range(15, 0, -1):
        socketio.emit('timer_update', {'time': i, 'phase': 'Voting'}, to=game_code)
        socketio.sleep(1)
    game['state'] = 'results'
    socketio.emit('phase_change', {'phase': 'results'}, to=game_code)
    calculate_and_show_results(game_code)

def calculate_and_show_results(game_code):
    game = games.get(game_code)
    if not game or not game['current_question']: return

    correct_idx = game['current_question']['correct_answer_index']
    
    for sid, answer in game['current_answers'].items():
        if sid in game['current_audience']:
            if answer == correct_idx:
                game['player_scores'][sid] = game['player_scores'].get(sid, 0) + 100

    vote_counts = {sid: 0 for sid in game['current_contestants']}
    for voter, voted_for in game['current_votes'].items():
        if voted_for in vote_counts:
            vote_counts[voted_for] += 1
    
    if vote_counts:
        max_votes = max(vote_counts.values())
        if max_votes > 0:
            winners = [sid for sid, count in vote_counts.items() if count == max_votes]
            points_per_winner = 300 // len(winners)
            for winner_sid in winners:
                if winner_sid in game['player_scores']:
                    game['player_scores'][winner_sid] += points_per_winner

    results_payload = {
        'correct_answer': game['current_question']['options'][correct_idx],
        'contestant_answers': {
            sid: {
                'username': data['username'],
                'answer': game['current_answers'].get(sid, "No answer"),
                'votes': vote_counts.get(sid, 0)
            } for sid, data in game['current_contestants'].items()
        },
        'scores': {
            game['players'][sid]['username']: score 
            for sid, score in game['player_scores'].items() 
            if sid in game['players']
        }
    }
    socketio.emit('show_results', results_payload, to=game_code)

    socketio.sleep(10)
    game['state'] = 'intermission'
    socketio.emit('prepare_for_next_round', to=game_code)

@socketio.on('player_submit_answer')
def handle_player_submit_answer(data):
    game_code = get_game_code_for_sid(request.sid)
    game = games.get(game_code)
    if not game: return
    
    game['current_answers'][request.sid] = data.get('answer')
    emit('answer_received')


@socketio.on('player_submit_vote')
def handle_player_submit_vote(data):
    game_code = get_game_code_for_sid(request.sid)
    game = games.get(game_code)
    if not game: return

    if request.sid in game['current_audience'] and request.sid not in game['current_votes']:
        game['current_votes'][request.sid] = data.get('contestant_sid')
        emit('vote_received')


@socketio.on('teacher_send_help')
def handle_teacher_send_help(data):
    game_code = get_game_code_for_sid(request.sid)
    game = games.get(game_code)
    if not game or game['host_sid'] != request.sid: return

    message = data.get('message', '').strip()
    words = message.split()
    if game['teacher_help_words_used'] + len(words) > 5:
        emit('error', {'message': 'Word limit exceeded'})
        return
    
    game['teacher_help_words_used'] += len(words)

    for sid in game['current_contestants']:
        socketio.emit('new_message', {
            'user': 'Teacher', 'text': message, 'color': '#FFD700'
        }, to=sid)

    emit('new_message', {'user': 'Teacher', 'text': message, 'color': '#FFD700'})

@socketio.on('send_message')
def handle_send_message(data):

    game_code = get_game_code_for_sid(request.sid)
    game = games.get(game_code)
    if not game or request.sid == game['host_sid']: return

    player_data = game['players'].get(request.sid)
    if not player_data: return

    message = data.get('message', '').strip()
    if message:
        socketio.emit('new_message', {
            'user': player_data['username'],
            'text': message,
            'color': player_data['color']
        }, to=game_code, include_self=True)

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)