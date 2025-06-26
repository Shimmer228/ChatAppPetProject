import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';

const socket = io('http://localhost:3001');

const ChatPage = () => {
  const [step, setStep] = useState('choice'); // 'choice' | 'create' | 'join' | 'chat'
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [room, setRoom] = useState('');
  const [password, setPassword] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [creatorName, setCreatorName] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    socket.off('chat_history');
    socket.off('receive_message');
    socket.off('room_metadata');
    socket.off('you_are_admin');
    socket.off('room_cleared');
    socket.off('error_message');

    socket.on('chat_history', ({ messages, isAdmin }) => {
      setChatMessages(messages);
      setIsAdmin(isAdmin);
      setStep('chat');
    });

    socket.on('receive_message', (msg) => {
      setChatMessages((prev) => [...prev, msg]);
    });

    socket.on('room_metadata', ({ creator, code }) => {
      setCreatorName(creator);
      setRoom(code);
    });

    socket.on('you_are_admin', () => setIsAdmin(true));

    socket.on('room_cleared', () => {
      alert('Кімнату видалено. Повертаємось на головну.');
      setStep('choice');
      resetState();
    });

    socket.on('error_message', (msg) => alert(msg));
    console.log('Сокет useEffect активний');
  }, []);

  const resetState = () => {
    setUsername('');
    setAvatarUrl('');
    setRoom('');
    setPassword('');
    setChatMessages([]);
    setIsAdmin(false);
    setCreatorName('');
    setMessage('');
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('avatar', file);

    const res = await fetch('http://localhost:3001/upload-avatar', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    setAvatarUrl(data.url);
  };

const handleCreateRoom = (e) => {
  e.preventDefault();
  if (!username.trim()) {
    alert("Введіть ім'я");
    return;
  }
  socket.emit('create_room', { name: username, avatar: avatarUrl, password });
};

  const handleJoinRoom = (e) => {
    e.preventDefault();
    socket.emit('join_room', { name: username, avatar: avatarUrl, code: room, password });
  };
    useEffect(() => {
      const handleBeforeUnload = (e) => {
        if (step === 'chat' && isAdmin) {
          e.preventDefault();
          e.returnValue = '';
        }
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }, [step, isAdmin]);

  if (step === 'choice') {
    return (
      <div style={styles.loginContainer}>
        <h2>Оберіть дію</h2>
        <button onClick={() => setStep('create')} style={styles.button}>Створити кімнату</button>
        <button onClick={() => setStep('join')} style={styles.button}>Приєднатись</button>
      </div>
    );
  }

  if (step === 'create' || step === 'join') {
    return (
      <div style={styles.loginContainer}>
        <h2>{step === 'create' ? 'Створити кімнату' : 'Приєднатись до кімнати'}</h2>
        <form onSubmit={step === 'create' ? handleCreateRoom : handleJoinRoom} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Ваше ім’я" style={styles.input} />
          <input type="file" accept="image/*" onChange={handleFileUpload} style={styles.input} />
          {step === 'join' && (
            <input
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="Код кімнати"
              style={styles.input}
            />
          )}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль" style={styles.input} />
          <button type="submit" style={styles.button}>{step === 'create' ? 'Створити' : 'Приєднатись'}</button>
        </form>
        <button onClick={() => setStep('choice')} style={styles.button}>← Назад</button>
      </div>
    );
  }

  if (step === 'chat') {
    return (
      <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h2>Кімната: <em>{room}</em></h2>
          <p>Творець: <strong>{creatorName}</strong></p>
        </div>
        <div style={styles.actionButtons}>
          <button
            onClick={() => {
              navigator.clipboard.writeText(room);
              alert('Код кімнати скопійовано у буфер обміну');
            }}
            style={styles.copyButton}
          >
             Копіювати код кімнати
          </button>
          {isAdmin && (
            <button
              onClick={() => socket.emit('clear_messages')}
              style={styles.clearButton}
            >
              Видалити чат
            </button>
          )}
        </div>
      </div>

        <div style={styles.messagesBox}>
          {chatMessages.map((msg, i) =>
            msg.system ? (
              <div key={i} style={styles.systemMessage}>{msg.text}</div>
            ) : (
              <div
                key={i}
                style={{
                  ...styles.message,
                  flexDirection: msg.username === username ? 'row-reverse' : 'row',
                  textAlign: msg.username === username ? 'right' : 'left'
                }}
              >
                <img src={msg.avatarUrl} alt="avatar" style={styles.avatar} />
                <div>
                  <strong>{msg.username}</strong> [{msg.time}]: {msg.text}
                </div>
              </div>
            )
          )}

        </div>

        <form onSubmit={(e) => { e.preventDefault(); socket.emit('send_message', { text: message }); setMessage(''); }} style={styles.form}>
          <input type="text" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Введіть повідомлення" style={styles.input} />
          <button type="submit" style={styles.button}>Надіслати</button>
        </form>
      </div>
    );
  }
};

const styles = {
  container: {
    maxWidth: 700,
    margin: '40px auto',
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#1e1e1e',
    color: '#f1f1f1',
    boxShadow: '0 0 10px rgba(0,0,0,0.4)'
  },
  loginContainer: {
    maxWidth: 400,
    margin: '100px auto',
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#2c2c2c',
    color: '#f1f1f1',
    boxShadow: '0 0 10px rgba(0,0,0,0.4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 15
  },
  messagesBox: {
    height: 400,
    overflowY: 'auto',
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#333',
    borderRadius: 8,
    border: '1px solid #444',
    color: '#f1f1f1'
  },
  message: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    color: '#ddd'
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: '1px solid #555'
  },
  systemMessage: {
    marginBottom: 10,
    fontStyle: 'italic',
    color: '#999',
    textAlign: 'center'
  },
  form: {
    display: 'flex',
    gap: 10,
    marginTop: 10
  },
  input: {
    flex: 1,
    padding: 10,
    borderRadius: 6,
    border: '1px solid #555',
    backgroundColor: '#222',
    color: '#f1f1f1',
    outline: 'none'
  },
  button: {
    padding: '10px 20px',
    backgroundColor: '#3a82f7',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'background-color 0.3s',
    minWidth: 160,
    marginBottom: 10,
    display: 'block'
  },
  clearButton: {
    marginTop: 10,
    padding: '10px 20px',
    backgroundColor: '#e53935',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'background-color 0.3s',
    minWidth: 160
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20
  },
  actionButtons: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10
  },
  copyButton: {
    padding: '10px 20px',
    backgroundColor: '#444',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'background-color 0.3s',
    minWidth: 160
  }

};


export default ChatPage;
