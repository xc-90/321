import random
import string
import os
from flask import Flask, render_template, request, session, redirect, url_for
from flask_socketio import SocketIO, emit, join_room, leave_room
import secrets

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", manage_session=True)
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY')
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_HTTPONLY'] = True

AVATAR_COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FED766', '#F0B3A8',
    '#8A84E2', '#3D405B', '#F2CC8F', '#81B29A', '#E07A5F',
    '#FF8B94', '#AED9E0', '#B4A7D6', '#FAE03C', '#C9ADA7',
    '#9AD1D4', '#DFCC74', '#FFA07A', '#98D8C8', '#F7B2AD',
    '#B8E6E1', '#FFC09F', '#FFEE93', '#FCF5C7', '#A0CED9'
]

games = {}

@socketio.on('announce_in_game')
def handle_announce_in_game(data):
    game_code = data.get('game_code')
    
    if not game_code or game_code not in games:
        emit('error', {'message': 'Game not found'})
        return
    
    game = games[game_code]
    
    # Check if this is the host
    is_host = (request.sid == game.get('host_sid') and game.get('host_verified'))
    
    if is_host:
        emit('identity_confirmed', {
            'is_host': True,
            'username': 'Teacher'
        })
    elif request.sid in game['players']:
        player_data = game['players'][request.sid]
        emit('identity_confirmed', {
            'is_host': False,
            'username': player_data['username'],
            'color': player_data['color']
        })
    else:
        emit('error', {'message': 'You are not in this game'})

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

# Flask Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/frame')
def frame():
    return render_template('frame.html')

@app.route('/join')
def join():
    return render_template('join.html')

@app.route('/host')
def host():
    return render_template('host.html')

@app.route('/host/<code>')
def host_lobby(code):
    game = games.get(code)
    if not game:
        return "Game not found", 404
    
    return render_template('host_lobby.html', game_code=code)

@app.route('/student/<code>/lobby')
def student_lobby(code):
    if code not in games:
        return "Game not found", 404
    
    username = session.get('username', 'Player')
    return render_template('student_lobby.html', game_code=code, username=username)

@app.route('/game/code/<code>')
def game_view(code):
    if code not in games:
        return "Game not found", 404
    
    return render_template('game.html', game_code=code)

# Socket.IO Events

@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")

@socketio.on('host_game')
def handle_host_game():
    game_code = generate_game_code()
    host_token = secrets.token_urlsafe(32)
    
    games[game_code] = {
        'host_sid': request.sid,
        'host_token': host_token,
        'host_verified': False, # Will be set to True after verification
        'state': 'lobby',
        'players': {}
    }
    
    join_room(game_code)

    print(f"Game {game_code} created by {request.sid}")
    emit('game_created', {'game_code': game_code, 'host_token': host_token})

@socketio.on('verify_host_token')
def handle_verify_host_token(data):
    game_code = data.get('game_code')
    token = data.get('host_token')
    
    if not game_code or game_code not in games:
        emit('access_denied', {'message': 'Game not found'})
        return
    
    game = games[game_code]
    
    # Check if token matches
    if token != game.get('host_token'):
        emit('access_denied', {'message': 'You did not create this game'})
        return
    
    old_sid = game.get('host_sid')
    game['host_sid'] = request.sid
    game['host_verified'] = True
    join_room(game_code)
    
    # Send current player list and host status
    player_list = list(game['players'].values())
    emit('host_verified', {
        'game_code': game_code, 
        'players': player_list,
        'is_host': True
    })

@socketio.on('join_game')
def handle_join_game(data):
    game_code = data.get('game_code', '').upper()
    username = data.get('username', '').strip()

    if not game_code or not username:
        emit('error', {'message': 'Invalid game code or username'})
        return

    if game_code not in games:
        emit('error', {'message': 'Game not found'})
        return
    
    old_sids_to_remove = []
    for sid, player_data in games[game_code]['players'].items():
        if player_data['username'] == username and sid != request.sid:
            old_sids_to_remove.append(sid)
    
    for old_sid in old_sids_to_remove:
        print(f"Removing old entry for {username} (old SID: {old_sid})")
        games[game_code]['players'].pop(old_sid, None)
    
    join_room(game_code)
    
    # Assign colors
    existing_color = None
    if request.sid in games[game_code]['players']:
        existing_color = games[game_code]['players'][request.sid].get('color')
    
    color = existing_color or random.choice(AVATAR_COLORS)
    
    games[game_code]['players'][request.sid] = {
        'username': username, 
        'color': color,
        'sid': request.sid
    }

    print(f"{username} ({request.sid}) joined game {game_code} - Total players: {len(games[game_code]['players'])}")
    emit('join_success', {'game_code': game_code, 'username': username, 'color': color})

    # Broadcast updated player list to everyone in the game
    player_list = list(games[game_code]['players'].values())
    socketio.emit('update_player_list', {'players': player_list}, to=game_code)

@socketio.on('start_game')
def handle_start_game():
    game_code = get_game_code_for_sid(request.sid)
    
    if not game_code or game_code not in games:
        emit('error', {'message': 'Invalid game'})
        return
    
    game = games[game_code]
    
    # Verify this is the host and they've been verified
    if game['host_sid'] != request.sid or not game.get('host_verified'):
        emit('error', {'message': 'Only the host can start game'})
        return
    
    if len(game['players']) == 0:
        emit('error', {'message': 'Need at least one player to start'})
        return
    
    game['state'] = 'active'
    print(f"Game {game_code} started by host")
    socketio.emit('redirect_to_game', {'game_code': game_code}, to=game_code)

@socketio.on('send_message')
def handle_send_message(data):
    game_code = get_game_code_for_sid(request.sid)
    if not game_code:
        return
    
    # Determine username
    username = "Teacher"
    if request.sid in games[game_code]['players']:
        username = games[game_code]['players'][request.sid]['username']

    message = data.get('message', '')
    if message:
        socketio.emit('new_message', {'user': username, 'text': message}, to=game_code)

@socketio.on('disconnect')
def handle_disconnect():
    game_code = get_game_code_for_sid(request.sid)
    if not game_code:
        return

    sid = request.sid
    
    def handle_disconnect_delayed():
        socketio.sleep(2)
        
        if game_code not in games:
            return
        
        if games[game_code].get('host_sid') == sid:

            if games[game_code].get('host_sid') == sid:
                print(f"Game {game_code} ended")
                socketio.emit('error', 
                            {'message': 'The game has closed as the host disconnected'}, 
                            to=game_code)
                del games[game_code]
            return
        
        if sid in games[game_code]['players']:
            username = games[game_code]['players'][sid]['username']
            games[game_code]['players'].pop(sid, None)
            
            print(f"{username} ({sid}) left game {game_code}")
            
            player_list = list(games[game_code]['players'].values())
            socketio.emit('update_player_list', {'players': player_list}, to=game_code)
    
    socketio.start_background_task(handle_disconnect_delayed)

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)