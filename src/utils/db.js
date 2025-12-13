const { Sequelize } = require("sequelize");
require("dotenv").config();

// Suporta tanto variáveis do Railway (PG*) quanto variáveis customizadas (DB_*)
const dbConfig = {
  database: process.env.DB_NAME || process.env.PGDATABASE,
  username: process.env.DB_USER || process.env.PGUSER,
  password: process.env.DB_PASS || process.env.PGPASSWORD,
  host: process.env.DB_HOST || process.env.PGHOST,
  port: process.env.DB_PORT || process.env.PGPORT || 5432,
  dialect: "postgres",
  ssl: {
    rejectUnauthorized: false,
  },
  logging: false,
};

const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect,
    ssl: dbConfig.ssl,
    logging: dbConfig.logging,
  }
);

// Authenticate assíncrono - não bloqueia o módulo
console.log("🔌 Tentando conectar ao banco de dados...");
sequelize
  .authenticate()
  .then(() => {
    console.log("✅ Conexão com o banco de dados estabelecida com sucesso!");
  })
  .catch((error) => {
    console.error("❌ Erro ao conectar com o banco de dados:", error);
    console.error("⚠️ Aplicação continua rodando, mas operações de banco falharão");
  });

module.exports = sequelize;
