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

console.log("🚀 Iniciando servidor...");

const app = express();

// Configurações do Express
app.set('trust proxy', 1); // Confia no proxy do Railway
app.disable('x-powered-by'); // Remove header desnecessário

const server = http.createServer(app);

// Configurações do servidor HTTP
server.keepAliveTimeout = 65000; // 65 segundos (mais que o padrão do load balancer)
server.headersTimeout = 66000; // Mais que keepAliveTimeout

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

console.log("✅ Express e Socket.IO configurados");

// Middleware PRIMEIRO - log RAW de TODAS as requisições
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📨 [${timestamp}] ${req.method} ${req.path}`);
  console.log(`   Origin: ${req.headers.origin || 'No origin'}`);
  console.log(`   User-Agent: ${req.headers['user-agent'] || 'Unknown'}`);
  console.log(`   IP: ${req.ip || req.connection.remoteAddress}`);
  console.log(`${'='.repeat(80)}\n`);
  
  // Garantir que a resposta será enviada
  const originalSend = res.send;
  res.send = function(data) {
    console.log(`📤 Resposta enviada para ${req.method} ${req.path} - Status: ${res.statusCode}`);
    originalSend.call(this, data);
  };
  
  next();
});

// Timeout para requisições - evita requisições penduradas
app.use((req, res, next) => {
  req.setTimeout(30000); // 30 segundos
  res.setTimeout(30000);
  next();
});

// Configuração do body parser
app.use(bodyParser.urlencoded({ extended: true, limit: "900mb" }));
app.use(bodyParser.json({ limit: "900mb" }));

// Configuração de CORS - Mais permissiva para debug
const corsOptions = {
  origin: function (origin, callback) {
    console.log(`🔍 CORS verificando origem: ${origin || 'sem origin'}`);
    
    // Permitir requisições sem origin (como apps mobile, Postman, etc)
    if (!origin) {
      console.log("✅ CORS permitido (sem origin)");
      return callback(null, true);
    }
    
    const allowedOrigins = [
      "http://localhost:3000",
      "https://plataforma-manager-cardial.vercel.app",
    ];
    
    // Permite qualquer subdomínio do Vercel
    if (origin.match(/^https:\/\/.*\.vercel\.app$/)) {
      console.log(`✅ CORS permitido (Vercel): ${origin}`);
      return callback(null, true);
    }
    
    // Permite origens específicas
    if (allowedOrigins.indexOf(origin) !== -1) {
      console.log(`✅ CORS permitido (lista): ${origin}`);
      return callback(null, true);
    }
    
    // Temporariamente permitir todas para debug
    console.log(`⚠️ CORS origem não listada mas permitida: ${origin}`);
    return callback(null, true);
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
  preflightContinue: false, // Deixa o CORS middleware lidar com OPTIONS
  optionsSuccessStatus: 204 // Alguns navegadores legados (IE11) usam 204
};

app.use(cors(corsOptions));

// NÃO usar handler OPTIONS manual - deixa o middleware CORS lidar com isso

// Rota de teste ANTES de tudo - para verificar se servidor está vivo
app.get("/ping", (req, res) => {
  console.log("🏓 PING recebido!");
  res.status(200).json({ 
    status: "alive", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Rotas
console.log("🛣️ Carregando rotas...");
try {
  app.use("/", routes);
  console.log("✅ Rotas carregadas");
} catch (error) {
  console.error("❌ Erro ao carregar rotas:", error);
  throw error; // Rotas são críticas, então re-throw
}

// Middleware de tratamento de erros - DEVE SER APÓS AS ROTAS
app.use((err, req, res, next) => {
  // Erro do body parser
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('❌ Erro ao parsear JSON:', err.message);
    return res.status(400).json({ error: 'JSON inválido', details: err.message });
  }
  if (err.type === 'entity.too.large') {
    console.error('❌ Payload muito grande');
    return res.status(413).json({ error: 'Payload muito grande' });
  }
  
  // Outros erros
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
try {
  console.log("📡 Configurando Chat Socket Controller...");
  const chatSocketController = ChatSocketController(io);
  io.on("connection", chatSocketController.handleSocketConnection);
  console.log("✅ Chat Socket Controller configurado");
} catch (error) {
  console.error("❌ Erro ao configurar Chat Socket Controller:", error);
  console.error("⚠️ Continuando sem chat em tempo real...");
}

// Sincronizar com o banco de dados - NÃO BLOQUEIA o servidor
console.log("📊 Iniciando sincronização com banco de dados (assíncrono)...");
sequelize
  .sync({ force: false }) // Não dropar tabelas
  .then(() => {
    console.log("✅ Modelos sincronizados com o banco de dados");
  })
  .catch((error) => {
    console.error("❌ Erro ao sincronizar modelos com o banco de dados:", error);
    console.error("⚠️ Servidor continua rodando mesmo sem banco sincronizado");
    // NÃO BLOQUEIA o servidor mesmo se o banco falhar
  });

// NÃO AGUARDAR o sync do banco - continua imediatamente

const PORT = process.env.PORT || 4000;

// Iniciar servidor - IMPORTANTE: escutar em 0.0.0.0 para aceitar conexões externas
const HOST = '0.0.0.0'; // Necessário para Railway/Docker
server.listen(PORT, HOST, () => {
  console.log(`✅ Servidor web iniciado na porta: ${PORT}`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Listening on: ${HOST}:${PORT}`);
  console.log(`📡 Pronto para receber requisições!`);
  
  // Log quando recebe uma conexão TCP
  server.on('connection', (socket) => {
    console.log(`🔌 Nova conexão TCP recebida de ${socket.remoteAddress}`);
  });
}).on('error', (error) => {
  console.error("❌ Erro ao iniciar servidor:", error);
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Porta ${PORT} já está em uso`);
  }
  process.exit(1);
});

// Tratamento de erros não capturados - NÃO MATA O PROCESSO
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  // NÃO fazer process.exit() aqui - deixa o servidor rodando
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // NÃO fazer process.exit() aqui - deixa o servidor rodando
});

// Keep-alive simples para garantir que o processo não morra
setInterval(() => {
  // Não faz nada, apenas mantém o event loop ativo
}, 60000); // A cada 1 minuto

console.log("✅ Handlers de erro configurados");