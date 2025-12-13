// Script de teste para verificar se o servidor inicia corretamente
console.log("🧪 Testando inicialização do servidor...");

try {
  // Tentar carregar o app.js
  require('./app.js');
  console.log("✅ Servidor carregado com sucesso!");
} catch (error) {
  console.error("❌ Erro ao carregar servidor:");
  console.error(error);
  process.exit(1);
}

