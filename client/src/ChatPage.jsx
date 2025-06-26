import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';

const socket = io('http://localhost:3001');

const ChatPage = () => {
  const [username, setUsername] = useState('');
  const [room, setRoom] = useState('');
  const [message, setMessage] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [creatorName, setCreatorName] = useState('');

  useEffect(() => {
    socket.off('chat_history');
    socket.off('receive_message');
    socket.off('user_joined');
    socket.off('user_left');
    socket.off('room_metadata');
    socket.off('you_are_admin');
    socket.off('room_cleared');
    socket.off('error_message');

    socket.on('chat_history', ({ messages, isAdmin }) => {
      setChatMessages(messages);
      setIsAdmin(isAdmin);
      setIsLoggedIn(true);
    });

    socket.on('receive_message', (data) => {
      setChatMessages((prev) => [...prev, data]);
    });

    socket.on('room_metadata', ({ creator }) => {
      setCreatorName(creator);
    });

    socket.on('user_joined', (name) => {
      setChatMessages((prev) => [...prev, { system: true, text: `🔵 ${name} приєднався до чату` }]);
    });

    socket.on('user_left', (name) => {
      setChatMessages((prev) => [...prev, { system: true, text: `🔴 ${name} вийшов з чату` }]);
    });

    socket.on('you_are_admin', () => {
      setIsAdmin(true);
    });

    socket.on('room_cleared', () => {
      alert('Кімнату було видалено творцем. Ви повертаєтесь на головну сторінку.');
      resetState();
    });

    socket.on('error_message', (msg) => {
      alert(msg);
      // Скидаємо ім’я тільки в разі конфлікту
      if (msg.includes('Користувач з таким ім')) {
        setUsername('');
      }
    });
  }, []);

  const resetState = () => {
    setIsLoggedIn(false);
    setRoom('');
    setUsername('');
    setChatMessages([]);
    setCreatorName('');
    setIsAdmin(false);
    setAvatarUrl('');
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (username.trim() && room.trim()) {
      socket.emit('join_room', {
        name: username,
        roomName: room,
        avatar: avatarUrl
      });
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (message.trim()) {
      socket.emit('send_message', { text: message });
      setMessage('');
    }
  };

  const clearChat = () => {
    socket.emit('clear_messages');
  };

  if (!isLoggedIn) {
    return (
      <div style={styles.loginContainer}>
        <h2>Вхід у кімнату</h2>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Ваше ім’я"
            style={styles.input}
            required
          />

          <input
            type="text"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="Назва кімнати"
            style={styles.input}
            required
          />

          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files[0];
              if (!file) return;

              const formData = new FormData();
              formData.append('avatar', file);

              try {
                const res = await fetch('http://localhost:3001/upload-avatar', {
                  method: 'POST',
                  body: formData
                });
                const data = await res.json();
                setAvatarUrl(data.url);
              } catch (err) {
                console.error('Помилка при завантаженні аватарки:', err);
              }
            }}
            style={styles.input}
          />

          <button type="submit" style={styles.button}>Увійти</button>
        </form>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h2>💬 Кімната: <em>{room}</em></h2>
      <p><strong>Створив кімнату:</strong> {creatorName}</p>

      <div style={styles.messagesBox}>
        {chatMessages.map((msg, i) =>
          msg.system ? (
            <div key={i} style={styles.systemMessage}>{msg.text}</div>
          ) : (
            <div key={i} style={styles.message}>
              <img src={msg.avatarUrl} alt="avatar" style={styles.avatar} />
              <div>
                <strong>{msg.username}</strong> [{msg.time}]: {msg.text}
              </div>
            </div>
          )
        )}
      </div>

      <form onSubmit={sendMessage} style={styles.form}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Введіть повідомлення"
          style={styles.input}
        />
        <button type="submit" style={styles.button}>Надіслати</button>
      </form>

      {isAdmin && (
        <button onClick={clearChat} style={styles.clearButton}>
          🧹 Очистити чат
        </button>
      )}
    </div>
  );
};

const styles = {
  container: {
    maxWidth: 700,
    margin: '40px auto',
    padding: 20,
    border: '1px solid #ccc',
    borderRadius: 8
  },
  loginContainer: {
    maxWidth: 400,
    margin: '100px auto',
    padding: 20,
    border: '1px solid #ddd',
    borderRadius: 8
  },
  messagesBox: {
    height: 400,
    overflowY: 'auto',
    padding: 10,
    marginBottom: 10,
    background: '#f4f4f4',
    borderRadius: 6
  },
  message: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: '50%'
  },
  systemMessage: {
    marginBottom: 10,
    fontStyle: 'italic',
    color: '#666',
    textAlign: 'center'
  },
  form: {
    display: 'flex',
    gap: 10
  },
  input: {
    flex: 1,
    padding: 10,
    borderRadius: 4,
    border: '1px solid #ccc'
  },
  button: {
    padding: '10px 20px',
    background: '#007BFF',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer'
  },
  clearButton: {
    marginTop: 10,
    padding: '6px 14px',
    background: '#f44336',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer'
  }
};

export default ChatPage;
