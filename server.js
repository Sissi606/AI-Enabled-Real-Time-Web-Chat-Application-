const cpen322 = require('./cpen322-tester.js');
const path = require('path');
const express = require('express');
const WebSocket = require('ws');
const Database = require('./Database.js');
const messageBlockSize = 10; //size of conversation

function logRequest(req, res, next) {
	console.log(`${new Date()}  ${req.ip} : ${req.method} ${req.path}`);
	next();
}

const host = 'localhost';
const port = process.env.PORT || 3000;
const wsPort = process.env.WS_PORT || 8000;
const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017';
const dbName = process.env.DB_NAME || 'cpen322-messenger';
const clientApp = path.join(__dirname, 'client');
const db = new Database(mongoUrl, dbName);

const SessionManager = require('./SessionManager.js');
const sessionManager = new SessionManager();
const crypto = require('crypto');

const AI = require('./AI_features.js'); //import the AI features module

function sanitizeMessage(input) {
    // Neutralize HTML tags before messages are broadcast or persisted.
    return String(input === undefined || input === null ? '' : input)
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function sanitizeImageDataUrl(input) {
    const value = String(input === undefined || input === null ? '' : input).trim();
    if (!value) return '';

    // Keep payloads bounded to reduce memory pressure in websocket/db flow.
    if (value.length > 1_600_000) return '';

    const isSafeDataUrl = /^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(value);
    return isSafeDataUrl ? value : '';
}

function buildSemanticMessageText(message) {
    const text = sanitizeMessage(message && message.text).trim();
    const imageCaption = sanitizeMessage(message && message.imageCaption).trim();
    const hasImage = !!sanitizeImageDataUrl(message && message.image);

    if (text && imageCaption) {
        return `${text}\n[image context] ${imageCaption}`;
    }
    if (text) {
        return text;
    }
    if (imageCaption) {
        return `[image context] ${imageCaption}`;
    }
    return hasImage ? '[image]' : '';
}

async function fetchEmbeddingVector(input) {
    const text = sanitizeMessage(input).trim();
    if (!text) return [];

    const response = await fetch('http://127.0.0.1:1234/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'text-embedding-google_embeddinggemma-300m-qat',
            input: text
        })
    });

    const data = await response.json();
    return data.data?.[0]?.embedding || [];
}

function attachEnrichmentPromise(message, promise) {
    Object.defineProperty(message, '_enrichmentPromise', {
        value: promise,
        writable: true,
        configurable: true,
        enumerable: false
    });
}

function getEnrichmentPromise(message) {
    return message && typeof message._enrichmentPromise?.then === 'function'
        ? message._enrichmentPromise
        : Promise.resolve();
}

function clearEnrichmentPromise(message) {
    if (message && Object.prototype.hasOwnProperty.call(message, '_enrichmentPromise')) {
        delete message._enrichmentPromise;
    }
}

function enrichMessageInBackground(message) {
    const enrichment = (async () => {
        if (message.image && !message.imageCaption) {
            try {
                message.imageCaption = sanitizeMessage(
                    await AI.captionImage(message.image, message.text)
                ).trim();
            } catch (err) {
                console.error('Background image caption failed:', err);
            }
        }

        try {
            const semanticText = buildSemanticMessageText(message);
            message.embedding = semanticText ? await fetchEmbeddingVector(semanticText) : [];
        } catch (err) {
            console.error('Background embedding failed:', err);
            message.embedding = [];
        }
    })().finally(() => {
        clearEnrichmentPromise(message);
    });

    attachEnrichmentPromise(message, enrichment);
    return enrichment;
}

// Remove the hardcoded part and use the database instead
// var chatrooms = [
// 	{ id: 'room-1', name: 'Welcome', image: 'assets/everyone-icon.png' },
// 	{ id: 'room-2', name: 'CPEN 320', image: 'assets/chat-icon.png' },
// 	{ id: 'room-3', name: 'Off Topic', image: 'assets/profile-icon.png' }
// ];

// var messages = {};
// chatrooms.forEach((room) => {
// 	messages[room.id] = [];
// });

let messages = Object.create(null);

db.getRooms()
    .then(rooms => {
        rooms.forEach((room) => {
            messages[room._id] = [];

        });
        console.log("Initialized rooms:", Object.keys(messages));
    })
    .catch(err => {
        console.error('Error fetching rooms from database:', err);
    });

let app = express();

// Allow summarize requests to include small inline image attachments.
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));
app.use(logRequest);

// Chat API for lobby refresh (GET) and creating rooms (POST).
app.get('/chat', sessionManager.middleware, (req, res) => {
    db.getRooms().then(rooms => {
        const payload = rooms.map((room) => ({
            _id: room._id,
            name: room.name,
            image: room.image,
            messages: messages[room._id] || []
        }));
        res.status(200).json(payload); //sends the payload as JSON to the client.
    }).catch(err => {
        res.status(500).json({ error: err.toString() });
    });
	

	
}).post('/chat', sessionManager.middleware,(req,res) => {
    const room = req.body;

    if (!room || !room.name){
        res.status(400).json({ error: 'Missing name field' });
        return;
    }

    db.addRoom(room).then(insertedRoom => {
        messages[insertedRoom._id] = [];// Initialize message history for the new room
        res.status(200).json(insertedRoom);
    }).catch((err) => {
        res.status(400).json({ error: err.message });
    });
});

//Dynamically get a single room by its id from the database
app.get('/chat/:room_id', sessionManager.middleware, (req,res) => {
    const roomId = req.params.room_id;

    db.getRoom(roomId).then(room => {
        if (!room){
            return res.status(404).json({ error: 'Room not found' });
        }
        
        return res.status(200).json(room);
    })
        .catch(err => {
            res.status(500).json({ error: err.toString() });
        });
});

//An endpoint should return a Conversation based on the room_id parameter
// and the before parameter
app.get('/chat/:room_id/messages', sessionManager.middleware, (req,res) => {
    const roomId = req.params.room_id;
    const before = req.query.before ? Number(req.query.before) : undefined;

    db.getLastConversation(roomId, before).then(conversation => {
        if (!conversation){
            res.status(404).json({ error: "Conversation not found" });
            return
        }
        res.status(200).json(conversation);
    }).catch(err => {
        res.status(500).json({ error: err.toString() }); // Internal Server Error for database issues
    })
});

// WebSocket broker relays chat messages between connected clients
const broker = new WebSocket.Server({ port: wsPort });
broker.on('connection', (socket, request) => {
    // Reuse the session cookie to reject unauthenticated WebSocket clients.
    const cookie_header = request.headers.cookie;
    if (!cookie_header){
        socket.close();
        return;
    }
    const cookies = {};
    cookie_header.split(';').forEach(pair => {
        const parts = pair.trim().split('=');
        const name = parts[0];
        const value = parts.slice(1).join('=');
        cookies[name] = value;
    });

    const token = cookies['cpen322-session'];
    const username = sessionManager.getUsername(token);
    if (!token || !username) {
        socket.close();
        return;
    }
    socket.username = username;

	// Handle each message from a connected client socket
	socket.on('message', async (data) => {
        let msg;
        try{
            msg = JSON.parse(data.toString());
        }catch(err){
            return;
        }
        msg.username = socket.username;
        // Ignore any client-supplied username and sanitize before relaying or saving.
        msg.text = sanitizeMessage(msg.text);
        msg.image = sanitizeImageDataUrl(msg.image);
        msg.imageCaption = sanitizeMessage(msg.imageCaption).trim();
        if (!msg.image) {
            msg.imageCaption = '';
        }

        if (msg.text.trim() === '' && !msg.image) {
            return;
        }

        const roomId = msg.roomId;

        if (!messages[roomId]) {
            messages[roomId] = [];
        }

        messages[roomId].push(msg);
        enrichMessageInBackground(msg);

        const payload = JSON.stringify(msg);
        

		// Relay to all other clients except sender
		broker.clients.forEach((client) => {
			if (client !== socket && client.readyState === WebSocket.OPEN) {
				client.send(payload);
			}
		});


        if (messages[roomId].length === messageBlockSize) {
            //make a conversation block object
            const conversationMessages = messages[roomId];
            await Promise.all(conversationMessages.map((message) => getEnrichmentPromise(message)));
            const conversation = {
                room_id: roomId,
                timestamp: Date.now(),
                messages: conversationMessages
            };
            //store the conversation block in the database
            db.addConversation(conversation).then(() => {
                messages[roomId] = []; //clear the buffer
            }).catch(err => {
                console.error("Failed to save conversation:", err);
            });
        }


	});
});

app.get('/app.js', sessionManager.middleware, (req, res) => {
    res.sendFile(path.join(clientApp, 'app.js'));
});

app.get('/index.html', sessionManager.middleware, (req, res) => {
    res.sendFile(path.join(clientApp, 'index.html'));
});

app.get('/index', sessionManager.middleware, (req, res) => {
    res.sendFile(path.join(clientApp, 'index.html'));
});

app.get('/', sessionManager.middleware, (req, res) => {
    res.sendFile(path.join(clientApp, 'index.html'));
});

app.get('/profile', sessionManager.middleware, (req, res) => {
    res.status(200).json({
        username: req.username
    });
});


// Serve static frontend files after API routes.
app.use('/', express.static(clientApp, { extensions: ['html'] }));
app.listen(port, () => {
	console.log(`${new Date()}  App Started. Listening on ${host}:${port}, serving ${clientApp}`);
});

broker.on('listening', () => {
	console.log(`${new Date()}  WebSocket broker listening on ws://${host}:${wsPort}`);
});

//Stuff for login page

//Helper function to check password
function isCorrectPassword(password, saltHash){
    const salt = saltHash.slice(0, 20);
    const storedHash = saltHash.slice(20);
    const computedHash = crypto.createHash('sha256').update(password + salt).digest('base64');

    return computedHash === storedHash;

} 

app.get('/login', (req, res) => {
    res.sendFile(path.join(clientApp, 'login.html'));
});

app.post('/login',(req,res) => {
    const username = req.body.username;
    const password  = req.body.password;

    db.getUser(username).then(user => {
        //User not found -> back to login page
        if (!user){
            res.redirect('/login?error=username');
            return;
        }

        //Check password
        if (isCorrectPassword(password, user.password)){
            sessionManager.createSession(res, username);
            res.redirect('/'); // Redirect to the main page after successful login
        }else{
            res.redirect('/login?error=password'); // Redirect back to login page on failure
        }
    }).catch(err => {
        res.status(500).send('Server error');
    });
});

app.get('/logout', sessionManager.middleware, (req, res) => {
    // Logging out invalidates the server-side session and clears the browser cookie.
    sessionManager.deleteSession(req);
    res.clearCookie('cpen322-session');
    res.redirect('/login');
});

// custom error handler for session-related errors
app.use((err, req, res, next) => {
    if (err instanceof SessionManager.Error) {
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.status(401).json({ error: err.message });
        }
        return res.redirect('/login');
    }

    res.status(500).send('Internal Server Error');
});

//route for testing AI features
app.post('/ai/rewrite', async (req,res) => {
    try {
        const { message, context, tone } = req.body;

        if (!message || !message.trim()){
            return res.status(400).json({ error: 'Message is required' });
        }

        const result = await AI.rewriteMessage(
            message,
            context || 'general',
            tone || 'professional'
        );
        res.json({ result });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'AI error' });
    }
});

app.post('/ai/summarize', async (req, res) => {
    try {
        const inputMessages = (req.body && req.body.messages) || [];
        if (!Array.isArray(inputMessages) || inputMessages.length === 0) {
            return res.status(400).json({ error: 'messages must be a non-empty array' });
        }

        const normalizedMessages = inputMessages
            .map((msg) => {
                if (typeof msg === 'string') {
                    const text = String(msg).trim();
                    return text ? text : null;
                }

                if (!msg || typeof msg !== 'object') {
                    return null;
                }

                const username = sanitizeMessage(msg.username).trim() || 'Unknown';
                const text = sanitizeMessage(msg.text).trim();
                const image = sanitizeImageDataUrl(msg.image);
                const imageCaption = sanitizeMessage(msg.imageCaption).trim();

                if (!text && !image && !imageCaption) {
                    return null;
                }

                return {
                    username,
                    text,
                    image,
                    imageCaption
                };
            })
            .filter(Boolean);

        if (normalizedMessages.length === 0) {
            return res.status(400).json({ error: 'No non-empty messages to summarize' });
        }

        const result = await AI.summarizeMessages(normalizedMessages);
        res.status(200).json({ result });
    } catch (err) {
        console.error('Summarizer route error:', err);
        res.status(500).json({ error: err.message || 'AI summary error' });
    }
});

app.post('/ai/embed', async (req, res) => {
    try {
        console.log('embed route hit');

        const { text } = req.body;

        const response = await fetch('http://127.0.0.1:1234/v1/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'text-embedding-google_embeddinggemma-300m-qat',
                input: text
            })
        });

        const data = await response.json();

        res.json({
            embedding: data.data?.[0]?.embedding?.slice(0, 5) || []
        });
    } catch (err) {
        console.error('embed error:', err);
        res.status(500).json({ error: 'embedding failed' });
    }
});

app.post('/ai/caption-image', async (req, res) => {
    try {
        const image = sanitizeImageDataUrl(req.body && req.body.image);
        const text = sanitizeMessage(req.body && req.body.text).trim();
        if (!image) {
            return res.status(400).json({ error: 'Valid image is required' });
        }

        const result = await AI.captionImage(image, text);
        res.status(200).json({ result });
    } catch (err) {
        console.error('Caption route error:', err);
        res.status(500).json({ error: err.message || 'AI caption error' });
    }
});


app.post('/ai/embed', async (req, res) => {
    try {
        console.log('embed route hit');

        const { text } = req.body;

        const response = await fetch('http://127.0.0.1:1234/v1/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'text-embedding-google_embeddinggemma-300m-qat',
                input: text
            })
        });

        const data = await response.json();

        res.json({
            embedding: data.data?.[0]?.embedding?.slice(0, 5) || []
        });
    } catch (err) {
        console.error('embed error:', err);
        res.status(500).json({ error: 'embedding failed' });
    }
});

// Search endpoint for semantic search within one room
app.post('/ai/search', async (req, res) => {
    try {
        const { roomId, query } = req.body;

        if (!roomId || !query || !query.trim()) {
            return res.status(400).json({ error: 'roomId and query are required' });
        }

        let embedRes = await fetch('http://127.0.0.1:1234/v1/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'text-embedding-google_embeddinggemma-300m-qat',
                input: query
            })
        });

        const embedData = await embedRes.json();
        const queryEmbedding = embedData.data?.[0]?.embedding || [];

        let roomMessages = messages[roomId] || [];
        // also load from DB
        const convo = await db.getLastConversation(roomId);
        if (convo && convo.messages) {
            roomMessages = roomMessages.concat(convo.messages);
        }

        function dot(a, b) {
            let sum = 0;
            for (let i = 0; i < Math.min(a.length, b.length); i++) {
                sum += a[i] * b[i];
            }
            return sum;
        }

        function norm(v) {
            let sum = 0;
            for (const x of v) sum += x * x;
            return Math.sqrt(sum);
        }

        function cosineSimilarity(a, b) {
            const na = norm(a);
            const nb = norm(b);
            if (na === 0 || nb === 0) return -1;
            return dot(a, b) / (na * nb);
        }

        const ranked = roomMessages
            .filter(msg => Array.isArray(msg.embedding) && msg.embedding.length > 0)
            .map(msg => ({
                username: msg.username,
                text: msg.text,
                image: msg.image,
                score: cosineSimilarity(queryEmbedding, msg.embedding)
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);

        res.json({ results: ranked });
    } catch (err) {
        console.error('search error:', err);
        res.status(500).json({ error: 'search failed' });
    }
});



cpen322.connect('https://ubc-cpen-322.github.io/obfuscated/test-a5-server.js');
cpen322.export(__filename, { app, db, messages, broker, messageBlockSize, isCorrectPassword, sessionManager });
