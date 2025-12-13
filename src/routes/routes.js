const express = require("express");
const router = express.Router();
router.use(express.json());
const authMiddleware = require("../middleware/auth");
const optionalAuth = require("../middleware/optionalAuth");
const chatRepository = require("../repositories/chatRepository");
const { Usuario } = require("../model/Usuarios");

// Rota de healthcheck
router.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Rota de teste para verificar se o servidor está recebendo POST
router.post("/test", (req, res) => {
  console.log("📝 Teste POST recebido:", req.body);
  res.status(200).json({ message: "POST funcionando", body: req.body });
});

// Função para validar permissões de conversa
function validarPermissaoConversa(roleRemetente, roleDestinatario) {
  // Admin pode conversar com qualquer um
  if (roleRemetente === 'admin') {
    return true;
  }
  
  // Cliente só pode conversar com empresa ou funcionário
  if (roleRemetente === 'cliente' && (roleDestinatario === 'empresa' || roleDestinatario === 'empresa-funcionario')) {
    return true;
  }
  
  // Empresa só pode conversar com cliente
  if (roleRemetente === 'empresa' && roleDestinatario === 'cliente') {
    return true;
  }
  
  // Funcionário só pode conversar com cliente
  if (roleRemetente === 'empresa-funcionario' && roleDestinatario === 'cliente') {
    return true;
  }
  
  // Outros casos não são permitidos
  return false;
}

const UsuarioController = require("../controllers/usuariosController");
const usuariosController = UsuarioController();
const ChatController = require("../controllers/chatController");
const chatController = ChatController();
const ProjetoController = require("../controllers/projetoController");
const projetoController = ProjetoController();
const PedidoController = require("../controllers/pedidoController");
const pedidoController = PedidoController();
const FaturamentoController = require("../controllers/faturamentoController");
const faturamentoController = FaturamentoController();

router.post("/cadastrar", usuariosController.cadastrar);
router.post("/login", usuariosController.logar);
router.get("/usuarios", authMiddleware, usuariosController.listar);
router.get("/usuarios/:id", usuariosController.buscarPorId);
router.put("/usuarios/:id", usuariosController.atualizar);
router.patch("/usuarios/:id/perfil", authMiddleware, usuariosController.atualizarPerfil);
router.patch("/usuarios/:id/senha", authMiddleware, usuariosController.alterarSenha);
router.patch("/usuarios/:id/foto", authMiddleware, usuariosController.atualizarFotoPerfil);
router.delete("/usuarios/:id", usuariosController.deletar);

// GET /projetos usa autenticação OPCIONAL:
// - Sem token ou com role cliente/admin -> marketplace (todos os projetos)
// - Com role empresa/empresa-funcionario -> filtrado pela empresa correta
router.get("/projetos", optionalAuth, projetoController.listar);
router.get("/projetos/:id", projetoController.buscarPorId);
router.post("/projetos", authMiddleware, projetoController.criar);
router.put("/projetos/:id", authMiddleware, projetoController.atualizar);
router.delete("/projetos/:id/fotos/:fotoId", authMiddleware, projetoController.deletarFoto);
router.delete("/projetos/:id", projetoController.deletar);
router.post("/projetos/:id/fotos", authMiddleware, projetoController.adicionarFoto);

// Pedidos
router.get("/pedidos", authMiddleware, pedidoController.listar);
router.post("/pedidos", authMiddleware, pedidoController.criar);
router.get("/pedidos/:id", authMiddleware, pedidoController.buscarPorId);
router.put("/pedidos/:id", authMiddleware, pedidoController.atualizar);
router.put("/pedidos/:id/cancelar", authMiddleware, pedidoController.cancelar);
router.delete("/pedidos/:id", authMiddleware, pedidoController.excluir);

// Gráfico de Faturamentos
router.get("/grafico-faturamentos", authMiddleware, faturamentoController.getGraficoFaturamentos);

// Rotas de Chat
router.get("/conversas", authMiddleware, chatController.listarConversas);
router.get("/conversas/:conversa_id/mensagens", authMiddleware, chatController.listarMensagens);
router.put("/mensagens/:mensagem_id/lida", authMiddleware, chatController.marcarComoLida);

router.post("/conversas", authMiddleware, async (req, res) => {
  try {
    const { destinatario_id } = req.body;
    const usuario_id = req.user.usuario_id;

    if (!destinatario_id) {
      return res.status(400).json({ 
        error: "destinatario_id é obrigatório" 
      });
    }

    // Validar destinatário
    const destinatario = await Usuario.findByPk(destinatario_id);
    if (!destinatario) {
      return res.status(404).json({ error: "Destinatário não encontrado" });
    }

    // Validar permissões de conversa
    const podeConversar = validarPermissaoConversa(req.user.role, destinatario.role);
    if (!podeConversar) {
      return res.status(400).json({
        error: "Conversa não permitida entre estes tipos de usuário",
      });
    }

    // Normalizar conversa: cliente sempre usuario1, empresa pai sempre usuario2
    let usuario1_id, usuario2_id;
    
    if (req.user.role === 'cliente') {
      // Cliente iniciando conversa: normalizar para empresa pai
      const normalizada = await chatRepository.normalizarConversa(usuario_id, destinatario_id);
      usuario1_id = normalizada.usuario1_id;
      usuario2_id = normalizada.usuario2_id;
    } else if (req.user.role === 'empresa' || req.user.role === 'empresa-funcionario') {
      // Empresa/funcionário iniciando conversa: normalizar para empresa pai como usuario2
      const empresaPaiId = await chatRepository.buscarEmpresaPaiId(usuario_id);
      if (!empresaPaiId) {
        return res.status(400).json({ error: "Empresa não encontrada" });
      }
      usuario1_id = destinatario_id; // Cliente sempre usuario1
      usuario2_id = empresaPaiId; // Empresa pai sempre usuario2
    } else {
      return res.status(403).json({ error: "Apenas clientes, empresas e funcionários podem criar conversas" });
    }

    // Criar ou recuperar conversa normalizada
    const conversa = await chatRepository.criarConversaSeNaoExistir(
      usuario1_id,
      usuario2_id
    );

    // Buscar detalhes dos participantes
    const usuario1 = await Usuario.findByPk(conversa.usuario1_id, {
      attributes: ["usuario_id", "nome", "email", "role", "foto_perfil"],
    });
    const usuario2 = await Usuario.findByPk(conversa.usuario2_id, {
      attributes: ["usuario_id", "nome", "email", "role", "foto_perfil"],
    });

    res.status(201).json({
      message: "Conversa criada com sucesso",
      conversa: {
        conversa_id: conversa.conversa_id,
        usuario1_id: conversa.usuario1_id,
        usuario2_id: conversa.usuario2_id,
        ultima_mensagem: conversa.ultima_mensagem,
        Usuario1: usuario1,
        Usuario2: usuario2,
      },
    });
  } catch (error) {
    console.error("Erro ao criar conversa:", error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;