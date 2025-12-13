const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const authConfig = require("./src/config/auth.json");

console.log("🚀 Iniciando servidor...");

const app = express();
const server = http.createServer(app);

// Configurações básicas do Express
app.set('trust proxy', 1);
app.disable('x-powered-by');

console.log("✅ Express configurado");

// CORS - Simples e permissivo
app.use(cors({
  origin: true, // Permite qualquer origem temporariamente
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"]
}));

console.log("✅ CORS configurado");

// Body Parser - Limite alto para upload de imagens base64
app.use(bodyParser.urlencoded({ extended: true, limit: "100mb" }));
app.use(bodyParser.json({ limit: "100mb" }));

console.log("✅ Body Parser configurado");

// Log de requisições - SIMPLES
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path} - ${req.headers.origin || 'no-origin'}`);
  next();
});

// Rota de health check SIMPLES
app.get("/ping", (req, res) => {
  console.log("🏓 PING!");
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/health", (req, res) => {
  console.log("🏥 HEALTH CHECK!");
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

console.log("✅ Rotas de teste configuradas");

// Carregar rotas principais
console.log("📋 Carregando rotas...");
const routes = require("./src/routes/routes");
app.use("/", routes);
console.log("✅ Rotas carregadas");

// Middleware de erro - DEPOIS das rotas
app.use((err, req, res, next) => {
  console.error("❌ Erro:", err.message);
  res.status(500).json({ error: "Erro interno", message: err.message });
});

console.log("✅ Middleware de erro configurado");

// Socket.IO
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
    credentials: true
  }
});

console.log("✅ Socket.IO configurado");

// Middleware Socket.IO
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error("Token não fornecido"));
  }
  try {
    const decoded = jwt.verify(token, authConfig.secret);
    socket.user = decoded;
    next();
  } catch (error) {
    next(new Error("Token inválido"));
  }
});

// Chat Socket Controller
try {
  const ChatSocketController = require("./src/controllers/chatSocketController");
  const chatSocketController = ChatSocketController(io);
  io.on("connection", chatSocketController.handleSocketConnection);
  console.log("✅ Chat Socket Controller configurado");
} catch (error) {
  console.error("⚠️ Erro ao configurar Chat Socket Controller:", error.message);
}

// Banco de dados - NÃO BLOQUEIA
const sequelize = require("./src/utils/db");
sequelize.sync({ force: false })
  .then(() => console.log("✅ Banco sincronizado"))
  .catch((err) => console.error("⚠️ Erro no banco:", err.message));

// Iniciar servidor
const PORT = process.env.PORT || 4000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ SERVIDOR RODANDO`);
  console.log(`📡 Porta: ${PORT}`);
  console.log(`🌍 Host: ${HOST}`);
  console.log(`🔗 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`${'='.repeat(60)}\n`);
});

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});

console.log("✅ Configuração completa!");
