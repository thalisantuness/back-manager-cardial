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
    origin: function (origin, callback) {
      // Permite requisições sem origin ou das origens permitidas
      if (!origin) return callback(null, true);
      
      const allowedOrigins = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
        "http://localhost:5174",
        "https://plataforma-manager-cardial.vercel.app",
        process.env.FRONTEND_URL,
      ].filter(Boolean);
      
      // Verifica se está na lista ou é localhost
      if (
        allowedOrigins.includes(origin) ||
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:")
      ) {
        callback(null, true);
      } else {
        callback(new Error("Não permitido pelo CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  },
});

app.use(bodyParser.urlencoded({ extended: true, limit: "900mb" }));
app.use(bodyParser.json({ limit: "900mb" }));

// Configuração de CORS
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173", // Vite
  "http://localhost:5174",
  "https://plataforma-manager-cardial.vercel.app", // Frontend em produção
  process.env.FRONTEND_URL, // URL do frontend em produção (variável de ambiente)
].filter(Boolean); // Remove valores undefined/null

// Log das origens permitidas ao iniciar
console.log("🌐 Origens CORS permitidas:", allowedOrigins);

app.use(
  cors({
    origin: function (origin, callback) {
      // Permite requisições sem origin (mobile apps, Postman, etc)
      if (!origin) {
        console.log("✅ CORS: Requisição sem origin permitida");
        return callback(null, true);
      }
      
      // Verifica se a origem está na lista de permitidas
      if (allowedOrigins.includes(origin)) {
        console.log(`✅ CORS: Origem permitida: ${origin}`);
        callback(null, true);
      } else {
        // Em desenvolvimento, permite localhost mesmo que não esteja na lista
        if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
          console.log(`✅ CORS: Localhost permitido: ${origin}`);
          callback(null, true);
        } else {
          console.warn(`❌ CORS bloqueado para origem: ${origin}`);
          callback(new Error("Não permitido pelo CORS"));
        }
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
    exposedHeaders: ["Content-Range", "X-Content-Range"],
    maxAge: 86400, // 24 horas
  })
);

// Middleware adicional para garantir que OPTIONS seja tratado corretamente
app.options("*", cors());

app.use("/", routes);

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