import random
import string
import os
from flask import Flask, render_template, request, session
from flask_socketio import SocketIO, emit, join_room
import threading
import secrets

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*") # This is insecure but needed while developing in codespaces, please change
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY')
# Need 25 colors in total, maybe make them randomly generated? (but also unique)
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
    
# Flask Routes
@app.route('/')
def index():
    return render_template('index.html')

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

    temp_secret = request.args.get('host_secret')
    if temp_secret:
        if temp_secret != game.get('host_secret'):
            return "You didn't make this game", 403

        final_secret = secrets.token_hex(16)
        game['host_secret_final'] = final_secret

        return render_template('host_lobby.html', game_code=code, host_secret=final_secret, redirect_clean=True)

    final_secret = game.get('host_secret_final')
    if not final_secret:
        return "You didn't make this game", 403

    return render_template('host_lobby.html', game_code=code, host_secret=final_secret)


@app.route('/student/<code>/lobby')
def student_lobby(code):
    if code not in games:
        return "Game not found", 404
    username = request.args.get('username') or session.get('username', 'Player')
    username = session.get('username', 'Player')
    return render_template('student_lobby.html', game_code=code, username=username)

@app.route('/game/code/<code>')
def game_view(code):
    if code not in games:
        return "Game not found", 404
    game_data = games[code]
    is_host = session.get('is_host', False) and session.get('game_code') == code
    return render_template('game.html', game_code=code, is_host=is_host)

# Socket.IO Events for the game

@socketio.on('host_game')
def handle_host_game():
    game_code = generate_game_code()
    host_secret = secrets.token_hex(16)
    join_room(game_code)
 
    games[game_code] = {
        'host_sid': request.sid,
        'host_secret': host_secret,
        'state': 'lobby',
        'players': {}
    }
    # Store info in the hosts session
    session['is_host'] = True
    session['game_code'] = game_code
    session['host_secret'] = host_secret

    print(f"{request.sid} created game {game_code}")
    emit('game_created', {'game_code': game_code, 'host_secret': host_secret})

@socketio.on('join_game')
def handle_join_game(data):
    game_code = data.get('game_code')
    username = data.get('username')

    if game_code not in games:
        emit('error', {'message': 'Game not found'})
        return
    
    join_room(game_code)
    # Most likely won't have time to add proper color selection but this is good enough
    color = random.choice(AVATAR_COLORS)
    games[game_code]['players'][request.sid] = {'username': username, 'color': color}
    # Store info in the students session
    session['username'] = username
    session['game_code'] = game_code

    print(f"{username} has joined the game {game_code}")
    emit('join_success', {'game_code': game_code})

    player_list = list(games[game_code]['players'].values())
    socketio.emit('update_player_list', {'players': player_list}, to=game_code)

@socketio.on('start_game')
def handle_start_game():
    game_code = session.get('game_code')
    if game_code and games[game_code]['host_sid'] == request.sid:
        games[game_code]['state'] = 'active'
        print(f"{game_code} started by host ")
        socketio.emit('redirect_to_game', {'game_code': game_code}, to=game_code)

@socketio.on('send_message')
def handle_send_message(data):
    game_code = get_game_code_for_sid(request.sid)
    if not game_code:
        return
    
    username = "Teacher" # Host will always be named teacher
    if request.sid in games[game_code]['players']:
        username = games[game_code]['players'][request.sid]['username']

    message = data.get('message')
    socketio.emit('new_message', {'user': username, 'text': message}, to=game_code)

# Needed as the host is redirected from /host to /host/<code>, game will instantly die without the delay
@socketio.on('reconnect_host')
def handle_reconnect_host(data):
    game_code = data.get('game_code')
    secret = data.get('host_secret')

    game = games.get(game_code)
    if not game or game.get('host_secret_final') != secret:
        emit('error', {'message': "You didn't make this game"})
        return

    game['host_sid'] = request.sid
    join_room(game_code)
    emit('reconnect_success', {'game_code': game_code})


@socketio.on('disconnect')
def handle_disconnect():
    game_code = get_game_code_for_sid(request.sid)
    if not game_code:
        return

    sid = request.sid

    def delete_game_later(): # Needed as the host is redirected from /host to /host/<code>, game will instantly die without the delay
        socketio.sleep(5)
        if game_code not in games:
            return

        if games[game_code].get('host_sid') == sid:
            print(f"{game_code} has ended as the host disconnected")
            socketio.emit(
                'error',
                {'message': 'The game has closed as the host disconnected'},
                to=game_code
            )
            del games[game_code]
            return

        if sid in games[game_code]['players']:
            games[game_code]['players'].pop(sid, None)
            player_list = list(games[game_code]['players'].values())
            socketio.emit('update_player_list', {'players': player_list}, to=game_code)

    socketio.start_background_task(delete_game_later)

if __name__ == '__main__':
    socketio.run(app, debug=True)