require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');


const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());

// --- SESSION & AUTHENTICATION SETUP ---
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'antigravity_core_secret',
    resave: false,
    saveUninitialized: false
}));

// Route Protection Middleware
app.use((req, res, next) => {
    // Whitelist specific paths (like login page and css)
    if (req.path === '/login.html' || req.path === '/login' || req.path === '/style.css') {
        return next();
    }
    
    // Redirect unauthenticated requests to login
    if (!req.session.authenticated) {
        return res.redirect('/login.html');
    }
    
    next();
});

// Login Handler
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    // Env Credentials
    const validUsername = process.env.APP_USERNAME || 'admin';
    const validPassword = process.env.APP_PASSWORD || 'password123';
    
    if (username === validUsername && password === validPassword) {
        req.session.authenticated = true;
        res.redirect('/');
    } else {
        res.redirect('/login.html?error=1');
    }
});

// Serve frontend only AFTER authentication passes
app.use(express.static('public'));

const upload = multer({ dest: 'uploads/' });

// API route
app.post('/remove-bg', upload.single('image'), async (req, res) => {
    try {
        const formData = new FormData();
        formData.append('size', 'auto');
        formData.append('image_file', fs.createReadStream(req.file.path));

        const response = await axios.post(
            'https://api.remove.bg/v1.0/removebg',
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'X-Api-Key': process.env.REMOVE_BG_API_KEY
                },
                responseType: 'arraybuffer'
            }
        );

        fs.writeFileSync('public/output.png', response.data);
        res.json({ image: 'output.png' });

    } catch (error) {
        console.error("BG-Remove API Error:", error.response ? error.response.data.toString() : error.message);
        res.status(500).json({ error: "API Error: Please check server console and your API Key." });
    }
});

// --- Socket.IO Chat Logic ---
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('user_join', (username) => {
        socket.username = username;
        io.emit('chat_message', {
            id: Date.now(),
            text: `${username} entered orbit.`,
            sender: 'SYSTEM',
            isSystem: true
        });
    });

    socket.on('chat_message', (msg) => {
        io.emit('chat_message', {
            id: msg.id || Date.now(),
            text: msg.text,
            sender: socket.username || 'Anonymous',
            isSystem: false
        });
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            io.emit('chat_message', {
                id: Date.now(),
                text: `${socket.username} left orbit.`,
                sender: 'SYSTEM',
                isSystem: true
            });
        }
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Server running on port ${port}`));