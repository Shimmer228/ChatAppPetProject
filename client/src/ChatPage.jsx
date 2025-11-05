import React, { useEffect, useMemo, useState, useCallback } from 'react';
import io from 'socket.io-client';

const socket = io('http://localhost:3001', { autoConnect: false });

const ChatPage = () => {
  const [step, setStep] = useState('auth'); // 'auth' | 'choice' | 'create' | 'join' | 'chat' | 'chats'
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [room, setRoom] = useState('');
  const [roomName, setRoomName] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [creatorName, setCreatorName] = useState('');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authUsername, setAuthUsername] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [myRooms, setMyRooms] = useState([]);
  const [accountAvatarUrl, setAccountAvatarUrl] = useState('');
  const [cryptoReady, setCryptoReady] = useState(false);
  const [derivedKey, setDerivedKey] = useState(null); // CryptoKey for AES-GCM
  const [participants, setParticipants] = useState([]);
  const [ownerName, setOwnerName] = useState('');

  // helper: base64
  const toBase64 = (arrayBuffer) => {
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };
  const fromBase64 = (b64) => {
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  };

  // derive key from room code
  useEffect(() => {
    (async () => {
      try {
        if (!room) { setDerivedKey(null); setCryptoReady(false); return; }
        const enc = new TextEncoder();
        const material = await window.crypto.subtle.importKey(
          'raw',
          enc.encode(room),
          'PBKDF2',
          false,
          ['deriveKey']
        );
        const key = await window.crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: enc.encode(room), iterations: 250000, hash: 'SHA-256' },
          material,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
        setDerivedKey(key);
        setCryptoReady(true);
      } catch (e) {
        setDerivedKey(null);
        setCryptoReady(false);
      }
    })();
  }, [room]);

  useEffect(() => {
    if (token) {
      socket.auth = { token };
      if (!socket.connected) socket.connect();
      if (step === 'auth') setStep('choice');
    } else {
      // For guest mode, still connect socket but without token
      socket.auth = {};
      if (step !== 'auth' && !socket.connected) {
        socket.connect();
      }
      // Only set step to 'auth' if we're at initial load
      if (!localStorage.getItem('token') && step === 'auth') {
        // Already on auth screen, do nothing
      }
    }
  }, [token, step]);

  // Ensure socket is connected when trying to create/join room
  useEffect(() => {
    if ((step === 'create' || step === 'join') && !socket.connected) {
      socket.auth = token ? { token } : {};
      socket.connect();
    }
  }, [step, token]);

  const fetchMyRooms = useCallback(async () => {
    if (!token) return;
    const res = await fetch('http://localhost:3001/me/chats', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setMyRooms(data.rooms || []);
    }
  }, [token]);

  const deleteRoomFromHistory = async (roomCode) => {
    if (!token) return;
    if (!window.confirm('Видалити цю кімнату з історії?')) return;
    try {
      const res = await fetch(`http://localhost:3001/me/chats/${roomCode}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        await fetchMyRooms(); // Refresh list
      } else {
        alert('Не вдалося видалити кімнату');
      }
    } catch (err) {
      console.error('Delete room error:', err);
      alert('Помилка при видаленні кімнати');
    }
  };

  useEffect(() => {
    socket.off('chat_history');
    socket.off('receive_message');
    socket.off('room_metadata');
    socket.off('you_are_admin');
    socket.off('room_cleared');
    socket.off('error_message');
    socket.off('participants_update');
    socket.off('you_are_not_admin');
    socket.off('kicked');

    socket.on('chat_history', ({ messages, isAdmin }) => {
      setChatMessages(messages);
      setIsAdmin(isAdmin);
      setStep('chat');
      // Refresh my rooms list if user is authenticated
      if (token) {
        fetchMyRooms();
      }
      // After entering the room and having derivedKey ready, if we're the admin and we have a plaintext roomName, push encrypted name to server
      setTimeout(async () => {
        if (isAdmin && roomName && cryptoReady && derivedKey) {
          try {
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const ct = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, derivedKey, new TextEncoder().encode(roomName));
            socket.emit('set_room_name_enc', { nameEnc: { ciphertext: toBase64(ct), iv: toBase64(iv), alg: 'AES-GCM' } });
          } catch {}
        }
      }, 0);
    });

    socket.on('receive_message', (msg) => {
      setChatMessages((prev) => [...prev, msg]);
    });

    socket.on('room_metadata', ({ creator, code, name, nameEnc }) => {
      setCreatorName(creator);
      setRoom(code);
      // Prefer encrypted name when available
      if (nameEnc && nameEnc.ciphertext && nameEnc.iv && derivedKey && cryptoReady) {
        (async () => {
          try {
            const ivBuf = fromBase64(nameEnc.iv);
            const ctBuf = fromBase64(nameEnc.ciphertext);
            const pt = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(ivBuf) }, derivedKey, ctBuf);
            setRoomName(new TextDecoder().decode(pt));
          } catch (e) {
            setRoomName(name || '');
          }
        })();
      } else {
        setRoomName(name || '');
      }
    });

    socket.on('you_are_admin', () => setIsAdmin(true));
    socket.on('you_are_not_admin', () => setIsAdmin(false));

    socket.on('participants_update', ({ users, owner }) => {
      // users can be array of strings or array of {name, isGuest}
      const normalized = (users || []).map((u) =>
        typeof u === 'string' ? { name: u, isGuest: true } : u
      );
      setParticipants(normalized);
      setOwnerName(owner || '');
    });

    socket.on('kicked', () => {
      alert('Вас було видалено з кімнати власником');
      setStep('choice');
      resetState();
    });

    socket.on('room_cleared', () => {
      alert('Кімнату видалено. Повертаємось на головну.');
      setStep('choice');
      resetState();
    });

    socket.on('error_message', (msg) => alert(msg));
    console.log('Сокет useEffect активний');
  }, [token, fetchMyRooms]);

  const resetState = () => {
    setUsername('');
    setAvatarUrl('');
    setRoom('');
    
    setChatMessages([]);
    setIsAdmin(false);
    setCreatorName('');
    setMessage('');
    setRoomName('');
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    try {
      const url = authMode === 'register' ? 'http://localhost:3001/auth/register' : 'http://localhost:3001/auth/login';
      const body = authMode === 'register'
        ? { username: authUsername, email: authEmail, password: authPassword, avatarUrl: accountAvatarUrl }
        : (authEmail ? { email: authEmail, password: authPassword } : { username: authUsername, password: authPassword });
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Auth error');
        return;
      }
      if (data.token) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setAuthPassword('');
        await fetchMyRooms();
      }
    } catch (err) {
      alert('Помилка авторизації');
    }
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

  const handleAccountAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('avatar', file);
    const res = await fetch('http://localhost:3001/upload-avatar', { method: 'POST', body: formData });
    const data = await res.json();
    setAccountAvatarUrl(data.url);
    // Keep chat avatar in sync with account avatar if none was explicitly chosen for this session
    if (!avatarUrl) setAvatarUrl(data.url);
    if (token) {
      await fetch('http://localhost:3001/me/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ avatarUrl: data.url })
      });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
    setStep('auth');
    setMyRooms([]);
    setAccountAvatarUrl('');
    if (socket.connected) {
      socket.disconnect();
    }
    resetState();
  };

const handleCreateRoom = (e) => {
  e.preventDefault();
  if (!username.trim()) {
    alert("Введіть ім'я");
    return;
  }
  if (!roomName.trim()) {
    alert('Введіть назву кімнати');
    return;
  }
  const finalAvatar = accountAvatarUrl || avatarUrl;
  socket.emit('create_room', { name: username, avatar: finalAvatar, roomName });
};

  const joinRoomDirect = async (roomCode, roomNameValue, savedUsername, savedAvatar) => {
    console.log('joinRoomDirect called', { roomCode, savedUsername, savedAvatar, token });
    setRoom(roomCode);
    setRoomName(roomNameValue || '');
    
    // Use saved username/avatar if available, otherwise use account username if logged in
    let finalUsername = savedUsername;
    let finalAvatar = savedAvatar || accountAvatarUrl || avatarUrl;
    
    // If no saved username but user is logged in, try to get account username
    if (!finalUsername && token) {
      try {
        // Try to decode token to get username (or fetch user info)
        // For now, we'll use a default based on token existence
        // In production, you might want to store user info in state
      } catch (e) {
        console.log('Could not get account username');
      }
    }
    
    if (finalUsername) {
      setUsername(finalUsername);
      if (finalAvatar) setAvatarUrl(finalAvatar);
    }
    
    // Ensure socket is connected
    if (!socket.connected) {
      console.log('Socket not connected, connecting...');
      socket.auth = token ? { token } : {};
      socket.connect();
      // Wait for connection
      await new Promise((resolve, reject) => {
        if (socket.connected) {
          resolve();
          return;
        }
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
        socket.once('connect', () => {
          clearTimeout(timeout);
          resolve();
        });
        socket.once('connect_error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      }).catch((err) => {
        console.error('Failed to connect:', err);
        alert('Не вдалося підключитися до сервера. Спробуйте ще раз.');
        return;
      });
    }
    
    // Fallback to current state if no saved data
    if (!finalUsername) finalUsername = username;
    if (!finalAvatar) finalAvatar = accountAvatarUrl || avatarUrl;
    
    if (!finalUsername || !finalUsername.trim()) {
      // Fallback to manual join if no username available
      console.log('No username available, falling back to manual join');
      setStep('join');
      return;
    }
    
    console.log('Emitting join_room with saved data', { name: finalUsername, code: roomCode, savedUsername });
    socket.emit('join_room', { name: finalUsername, avatar: finalAvatar, code: roomCode, savedUsername: savedUsername });
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    console.log('handleJoinRoom called', { username, room, socketConnected: socket.connected });
    if (!username.trim()) {
      alert("Введіть ім'я");
      return;
    }
    if (!room.trim()) {
      alert('Введіть код кімнати');
      return;
    }
    
    // Ensure socket is connected
    if (!socket.connected) {
      console.log('Socket not connected, connecting...');
      socket.auth = token ? { token } : {};
      socket.connect();
      // Wait for connection
      await new Promise((resolve, reject) => {
        if (socket.connected) {
          resolve();
          return;
        }
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
        socket.once('connect', () => {
          clearTimeout(timeout);
          resolve();
        });
        socket.once('connect_error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      }).catch((err) => {
        console.error('Failed to connect:', err);
        alert('Не вдалося підключитися до сервера. Спробуйте ще раз.');
        return;
      });
    }
    
    const finalAvatar = accountAvatarUrl || avatarUrl;
    console.log('Emitting join_room', { name: username, code: room });
    socket.emit('join_room', { name: username, avatar: finalAvatar, code: room });
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

  if (step === 'auth') {
    return (
      <div style={styles.loginContainer}>
        <h2>{authMode === 'register' ? 'Реєстрація' : 'Вхід'}</h2>
        <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {authMode === 'register' ? (
            <input type="text" value={authUsername} onChange={(e) => setAuthUsername(e.target.value)} placeholder="Нікнейм" style={styles.input} />
          ) : (
            <input type="text" value={authUsername} onChange={(e) => setAuthUsername(e.target.value)} placeholder="Нікнейм (або залиште порожнім та введіть email)" style={styles.input} />
          )}
          <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="Email (необов’язково)" style={styles.input} />
          <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="Пароль" style={styles.input} />
          <label style={{fontSize:12, color:'#bbb'}}>Аватар акаунта (необов’язково)</label>
          <input type="file" accept="image/*" onChange={handleAccountAvatarUpload} style={styles.input} />
          {accountAvatarUrl && <img src={accountAvatarUrl} alt="acc-avatar" style={{ width: 48, height: 48, borderRadius: '50%' }} />}
          <button type="submit" style={styles.button}>{authMode === 'register' ? 'Зареєструватись' : 'Увійти'}</button>
        </form>
        <button onClick={() => setAuthMode(authMode === 'register' ? 'login' : 'register')} style={styles.copyButton}>
          {authMode === 'register' ? 'В мене вже є акаунт' : 'Створити акаунт'}
        </button>
        <button onClick={() => setStep('choice')} style={styles.button}>Продовжити як гість</button>
      </div>
    );
  }

  if (step === 'choice') {
    return (
      <div style={styles.loginContainer}>
        {!token && (
          <div style={{ position: 'relative' }}>
            <button onClick={() => setStep('auth')} style={{ position: 'absolute', right: 0, top: -40, background:'#444', color:'#fff', border:'none', borderRadius:6, padding:'6px 10px', cursor:'pointer' }}>Екран входу</button>
          </div>
        )}
        <h2>Оберіть дію</h2>
        <button onClick={() => setStep('create')} style={styles.button}>Створити кімнату</button>
        <button onClick={() => setStep('join')} style={styles.button}>Приєднатись</button>
        {token && (
          <>
            <button onClick={async () => { await fetchMyRooms(); setStep('chats'); }} style={styles.button}>Мої чати</button>
            <label style={{fontSize:12, color:'#bbb'}}>Оновити аватар акаунта</label>
            <input type="file" accept="image/*" onChange={handleAccountAvatarUpload} style={styles.input} />
            <button onClick={handleLogout} style={styles.clearButton}>Вийти</button>
          </>
        )}
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
          {step === 'create' && (
            <input
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="Назва кімнати"
              style={styles.input}
            />
          )}
          {step === 'join' && (
            <input
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="Код кімнати"
              style={styles.input}
            />
          )}
          <button type="submit" style={styles.button}>{step === 'create' ? 'Створити' : 'Приєднатись'}</button>
        </form>
        <button onClick={() => setStep('choice')} style={styles.button}>← Назад</button>
      </div>
    );
  }

  const MessageItem = ({ msg, isMe, derivedKey, cryptoReady }) => {
    const [decrypted, setDecrypted] = useState(null);
    useEffect(() => {
      (async () => {
        const canDecrypt = cryptoReady && msg.ciphertext && msg.iv && derivedKey;
        if (!canDecrypt) { setDecrypted(null); return; }
        try {
          const ivBuf = fromBase64(msg.iv);
          const ctBuf = fromBase64(msg.ciphertext);
          const pt = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(ivBuf) }, derivedKey, ctBuf);
          setDecrypted(new TextDecoder().decode(pt));
        } catch (e) {
          setDecrypted('[не вдалося розшифрувати]');
        }
      })();
    }, [msg.ciphertext, msg.iv, derivedKey, cryptoReady]);

    const content = msg.ciphertext && cryptoReady ? (decrypted ?? '...') : (msg.text || '');
    return (
      <div
        style={{
          ...styles.message,
          flexDirection: isMe ? 'row-reverse' : 'row',
          textAlign: isMe ? 'right' : 'left'
        }}
      >
        <img src={msg.avatarUrl} alt="avatar" style={styles.avatar} />
        <div>
          <strong>{msg.username}</strong> [{msg.time}]: {content}
        </div>
      </div>
    );
  };

  if (step === 'chat') {
    return (
      <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h2>Кімната: <em>{roomName || '—'}</em></h2>
          <p>Власник: <strong>{ownerName || creatorName}</strong></p>
        </div>
        <div style={styles.actionButtons}>
          <button onClick={() => setStep('choice')} style={styles.copyButton}>В головне меню</button>
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

        <div style={styles.contentRow}>
          <div style={styles.messagesBox}>
            {chatMessages.map((msg, i) => (
              msg.system ? (
                <div key={i} style={styles.systemMessage}>{msg.text}</div>
              ) : (
                <MessageItem key={i} msg={msg} isMe={msg.username === username} derivedKey={derivedKey} cryptoReady={cryptoReady} />
              )
            ))}
          </div>
          <div style={styles.sidebar}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
              <strong>Учасники</strong>
              <button onClick={() => socket.emit('request_participants')} style={{...styles.copyButton, minWidth:'auto', padding:'6px 10px'}}>↻</button>
            </div>
            <div style={{fontSize:12, color:'#bbb', marginBottom:8}}>Власник: {ownerName || creatorName}</div>
            <div style={{display:'flex', flexDirection:'column', gap:6}}>
              {participants.map((u) => (
                <div key={u.name} style={{display:'flex', alignItems:'center', justifyContent:'space-between', background:'#2b2b2b', border:'1px solid #3a3a3a', borderRadius:6, padding:'6px 8px'}}>
                  <span style={{fontWeight: u.name === ownerName ? 'bold' : 'normal'}}>
                    {u.name}
                    {u.name === ownerName ? ' (власник)' : (u.isGuest ? ' (гість)' : '')}
                  </span>
                  {isAdmin && u.name !== ownerName && (
                    <div style={{display:'flex', gap:6}}>
                      <button onClick={() => socket.emit('kick_user', { username: u.name })} style={{...styles.clearButton, minWidth:'auto', padding:'6px 10px'}}>Видалити</button>
                      <button disabled={u.isGuest} title={u.isGuest ? 'Не можна передавати власність гостю' : ''} onClick={() => socket.emit('transfer_ownership', { username: u.name })} style={{...styles.copyButton, opacity: u.isGuest ? 0.6 : 1, cursor: u.isGuest ? 'not-allowed' : 'pointer', minWidth:'auto', padding:'6px 10px'}}>Передати власн.</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <form onSubmit={async (e) => {
          e.preventDefault();
          const text = message;
          setMessage('');
          if (cryptoReady && derivedKey && text) {
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const ct = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, derivedKey, new TextEncoder().encode(text));
            socket.emit('send_message', { ciphertext: toBase64(ct), iv: toBase64(iv), alg: 'AES-GCM' });
          } else {
            socket.emit('send_message', { text });
          }
        }} style={styles.form}>
          <input type="text" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Введіть повідомлення" style={styles.input} />
          <button type="submit" style={styles.button}>Надіслати</button>
        </form>
      </div>
    );
  }

  if (step === 'chats') {
    return (
      <div style={styles.loginContainer}>
        <h2>Мої чати</h2>
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          {myRooms.map((r, idx) => (
            <div key={idx} style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:'#333', padding:10, borderRadius:6, gap:10}}>
              <div style={{flex:1}}>
                <div><strong>{r.name || '—'}</strong></div>
                <div style={{fontSize:12, color:'#aaa'}}>Код: {r.code}</div>
              </div>
              <div style={{display:'flex', gap:10}}>
                <button onClick={() => joinRoomDirect(r.code, r.name, r.lastUsername, r.lastAvatarUrl)} style={styles.button}>Приєднатись</button>
                <button onClick={() => deleteRoomFromHistory(r.code)} style={{...styles.clearButton, minWidth:'auto', padding:'10px 15px'}} title="Видалити з історії">×</button>
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => setStep('choice')} style={styles.button}>← Назад</button>
      </div>
    );
  }
};

const styles = {
  container: {
    maxWidth: 980,
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
    color: '#f1f1f1',
    flex: 1,
    minWidth: 0
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    maxWidth: 420,
    justifyContent: 'flex-end'
  },
  copyButton: {
    padding: '10px 20px',
    backgroundColor: '#444',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'background-color 0.3s',
    minWidth: 120
  },
  contentRow: {
    display: 'flex',
    gap: 12,
    alignItems: 'stretch'
  },
  sidebar: {
    width: 260,
    backgroundColor: '#2c2c2c',
    border: '1px solid #3a3a3a',
    borderRadius: 8,
    padding: 10,
    height: 400,
    overflowY: 'auto'
  }

};


export default ChatPage;
