require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const path = require('path');

const app = express();
const server = http.createServer(app);


const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());

// Serve frontend directly as public entry point
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