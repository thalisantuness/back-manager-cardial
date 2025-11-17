const express = require("express");
const router = express.Router();
router.use(express.json());
const authMiddleware = require("../middleware/auth");
const chatRepository = require("../repositories/chatRepository");
const { Usuario } = require("../model/Usuarios");

// Função para validar permissões de conversa
function validarPermissaoConversa(roleRemetente, roleDestinatario) {
  // Admin pode conversar com qualquer um
  if (roleRemetente === 'admin') {
    return true;
  }
  
  // Cliente só pode conversar com empresa
  if (roleRemetente === 'cliente' && roleDestinatario === 'empresa') {
    return true;
  }
  
  // Empresa só pode conversar com cliente
  if (roleRemetente === 'empresa' && roleDestinatario === 'cliente') {
    return true;
  }
  
  // Outros casos não são permitidos
  return false;
}

const UsuarioController = require("../controllers/usuariosController");
const usuariosController = UsuarioController();
const ChatController = require("../controllers/chatController");
const chatController = ChatController();
const ProdutoController = require("../controllers/produtoController");
const produtoController = ProdutoController();
const PedidoController = require("../controllers/pedidoController");
const pedidoController = PedidoController();

router.post("/cadastrar", usuariosController.cadastrar);
router.post("/login", usuariosController.logar);
router.get("/usuarios", authMiddleware, usuariosController.listar);
router.get("/usuarios/:id", usuariosController.buscarPorId);
router.put("/usuarios/:id", usuariosController.atualizar);
router.patch("/usuarios/:id/perfil", authMiddleware, usuariosController.atualizarPerfil);
router.patch("/usuarios/:id/senha", authMiddleware, usuariosController.alterarSenha);
router.patch("/usuarios/:id/foto", authMiddleware, usuariosController.atualizarFotoPerfil);
router.delete("/usuarios/:id", usuariosController.deletar);

router.get("/produtos", produtoController.listar);
router.get("/produtos/:id", produtoController.buscarPorId);
router.post("/produtos", authMiddleware, produtoController.criar);
router.put("/produtos/:id", authMiddleware, produtoController.atualizar);
router.delete("/produtos/:id", produtoController.deletar);
router.post("/produtos/:id/fotos", produtoController.adicionarFoto);

// Pedidos
router.get("/pedidos", authMiddleware, pedidoController.listar);
router.post("/pedidos", authMiddleware, pedidoController.criar);
router.get("/pedidos/:id", authMiddleware, pedidoController.buscarPorId);
router.put("/pedidos/:id", authMiddleware, pedidoController.atualizar);
router.put("/pedidos/:id/cancelar", authMiddleware, pedidoController.cancelar);
router.delete("/pedidos/:id", authMiddleware, pedidoController.excluir);

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

    // Criar ou recuperar conversa
    const conversa = await chatRepository.criarConversaSeNaoExistir(
      usuario_id,
      destinatario_id
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