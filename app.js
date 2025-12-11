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
    origin: "*", // Ajustar para o endereço do app React Native em produção
    methods: ["GET", "POST"],
  },
});

app.use(bodyParser.urlencoded({ extended: true, limit: "900mb" }));
app.use(bodyParser.json({ limit: "900mb" }));
app.use(cors());
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