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

app.use(bodyParser.urlencoded({ extended: true, limit: "900mb" }));
app.use(bodyParser.json({ limit: "900mb" }));

// Configuração de CORS
app.use(
  cors({
    origin: [
      "http://localhost:3000", // Desenvolvimento
      "https://plataforma-manager-cardial.vercel.app", // Produção
      /^https:\/\/.*\.vercel\.app$/, // Permite todos os subdomínios Vercel
    ],
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