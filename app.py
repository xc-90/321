import random
import string
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room

app = Flask(__name__)
socketio = SocketIO(app)
# Need 25 colors in total, maybe make them randomly generated? (but also unique)
AVATAR_COLORS = [ 'red', 'blue', 'green', 'yellow', 'purple', 'orange' ]
games = {}

def generate_game_code():
    while True:
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=3))
        if code not in games:
            return code
def get_game_code_for_sid(sid):
    for code, game_data in games.items():
        if sid in game_data['players'] or sid == game_data.get('host_sid)'):
            return code
        return None
    
#Frontend is still very unfinished, this is just a placeholder
@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('host_game')
def handle_host_game():
    game_code = generate_game_code()
    join_room(game_code)
 
    games[game_code] = {
     'host_sid': request.sid,
     'state': 'lobby',
     'players': {}
}
    print(f"{request.sid} created game {game_code}")
    emit('game_created', {'game_code': game_code})

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

    print(f"{username} has joined the game {game_code}")
    emit('join_success')

    player_list = list(games[game_code]['players'].values())
    socketio.emit('update_player_list', {'players': player_list}, to=game_code)

@socketio.on('start_game')
def handle_start_game():
    game_code = get_game_code_for_sid(request.sid)
    if game_code and games[game_code]['host_sid'] == request.sid:
        games[game_code]['state'] = 'active'
        print(f"{game_code} started by host ")
        socketio.emit('game_started', to=game_code)
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

@socketio.on('disconnect')
def handle_disconnect():
    game_code = get_game_code_for_sid(request.sid)
    if game_code:
        if request.sid == games.get(game_code, {}).get('host_sid'):
            print(f"{game_code} has ended as the host disconnected")
            socketio.emit('error', {'message': 'The game has closed as the host disconnected'}, to=game_code)
            del games[game_code]
        elif request.sid in games[game_code]['players']:
            games[game_code]['players'].pop(request.sid)
            player_list = list(games[game_code]['players'].values())
            socketio.emit('update_player_list', {'players': player_list}, to=game_code)

if __name__ == '__main__':
    socketio.run(app, debug=True)