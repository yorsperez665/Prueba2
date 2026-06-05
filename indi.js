const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '50mb' }));

let sock;
let isConnected = false;

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        browser: ['Gavetas API', 'Chrome', '1.0.0']
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            isConnected = false;
            const shouldReconnect = (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut);
            console.log('Conexión cerrada. Reconectar:', shouldReconnect);
            if (shouldReconnect) startSock();
        } else if (connection === 'open') {
            isConnected = true;
            console.log('WhatsApp conectado');
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

startSock();

app.post('/enviar', async (req, res) => {
    try {
        const { numero, mensaje, archivo, nombreArchivo } = req.body;
        
        console.log('BODY RECIBIDO:', { numero, mensaje, tieneArchivo: !!archivo });

        if (!isConnected) {
            return res.status(503).json({ error: 'WhatsApp no conectado. Escanea el QR' });
        }

        // Enviar solo texto
        if (!archivo) {
            await sock.sendMessage(numero, { text: mensaje });
            return res.json({ success: true, mensaje: 'Mensaje enviado' });
        }

        // Enviar archivo desde base64
        const buffer = Buffer.from(archivo, 'base64');
        await sock.sendMessage(numero, {
            document: buffer,
            fileName: nombreArchivo || 'archivo.pdf',
            mimetype: 'application/pdf',
            caption: mensaje
        });

        res.json({ success: true, mensaje: 'Archivo enviado' });

    } catch (error) {
        console.error('Error enviando:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/estado', (req, res) => {
    res.json({ connected: isConnected });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT,'0.0.0.0', () => console.log(`Servidor en puerto ${PORT}`));
