const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const sequelize = require("./src/utils/db");
const routes = require("./src/routes/routes");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const authConfig = require("./src/config/auth.json");
const ChatSocketController = require("./src/controllers/chatSocketController");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://plataforma-manager-cardial.vercel.app",
      /^https:\/\/.*\.vercel\.app$/,
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  },
});

// Middleware de logging de requisições
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path} - Origin: ${req.headers.origin || 'No origin'}`);
  next();
});

// Configuração do body parser com tratamento de erros
app.use(bodyParser.urlencoded({ extended: true, limit: "900mb" }));
app.use(bodyParser.json({ limit: "900mb" }));

// Middleware para capturar erros do bodyParser
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('❌ Erro ao parsear JSON:', err.message);
    return res.status(400).json({ error: 'JSON inválido', details: err.message });
  }
  if (err.type === 'entity.too.large') {
    console.error('❌ Payload muito grande');
    return res.status(413).json({ error: 'Payload muito grande' });
  }
  next(err);
});

// Configuração de CORS - Mais permissiva para debug
app.use(
  cors({
    origin: function (origin, callback) {
      // Permitir requisições sem origin (como apps mobile, Postman, etc)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = [
        "http://localhost:3000",
        "https://plataforma-manager-cardial.vercel.app",
      ];
      
      // Permite qualquer subdomínio do Vercel
      if (origin.match(/^https:\/\/.*\.vercel\.app$/)) {
        return callback(null, true);
      }
      
      // Permite origens específicas
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }
      
      // Log para debug - ver qual origem está sendo bloqueada
      console.log("❌ CORS bloqueado para origem:", origin);
      return callback(null, true); // Temporariamente permitir todas
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
  })
);

// Tratamento explícito de requisições OPTIONS (preflight)
app.options("*", (req, res) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.header("Access-Control-Allow-Credentials", "true");
  res.sendStatus(200);
});

app.use("/", routes);

// Middleware de tratamento de erros global
app.use((err, req, res, next) => {
  console.error("💥 Erro não tratado:", err);
  console.error("Stack trace:", err.stack);
  res.status(500).json({
    error: "Erro interno do servidor",
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined
  });
});

// Middleware de autenticação Socket.IO
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error("Token não fornecido"));
  }
  try {
    const decoded = jwt.verify(token, authConfig.secret);
    socket.user = decoded; // Armazenar dados do usuário no socket
    next();
  } catch (error) {
    next(new Error("Token inválido"));
  }
});

// Passar a instância do io para o ChatSocketController
const chatSocketController = ChatSocketController(io);
io.on("connection", chatSocketController.handleSocketConnection);

sequelize
  .sync({ force: false }) // Não dropar tabelas
  .then(() => {
    console.log("Modelos sincronizados com o banco de dados");
  })
  .catch((error) => {
    console.error("Erro ao sincronizar modelos com o banco de dados:", error);
  });

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Servidor web iniciado na porta: ${PORT}`);
});