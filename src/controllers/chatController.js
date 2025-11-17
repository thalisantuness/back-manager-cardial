const chatRepository = require("../repositories/chatRepository");
const { Conversa } = require("../model/Conversa");
const { Usuario } = require("../model/Usuarios");
const { Sequelize } = require("sequelize");
//
function ChatController() {
  async function listarConversas(req, res) {
    try {
      const usuario_id = req.user?.usuario_id;
      if (!usuario_id) {
        console.error("Erro: req.user é nulo ou não contém usuario_id");
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      const conversas = await chatRepository.listarConversas(usuario_id);
      res.json(conversas);
    } catch (error) {
      console.error("Erro ao listar conversas:", error);
      res.status(500).json({ error: "Erro ao listar conversas: " + error.message });
    }
  }

  async function listarMensagens(req, res) {
    try {
      const { conversa_id } = req.params;
      const usuario_id = req.user?.usuario_id;
      if (!usuario_id) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }
      const mensagens = await chatRepository.listarMensagens(conversa_id, usuario_id);
      res.json(mensagens);
    } catch (error) {
      console.error("Erro ao listar mensagens:", error);
      res.status(400).json({ error: error.message });
    }
  }

  async function marcarComoLida(req, res) {
    try {
      const { mensagem_id } = req.params;
      const usuario_id = req.user?.usuario_id;
      if (!usuario_id) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }
      await chatRepository.marcarMensagemComoLida(mensagem_id, usuario_id);
      res.json({ message: "Mensagem marcada como lida" });
    } catch (error) {
      console.error("Erro ao marcar mensagem como lida:", error);
      res.status(400).json({ error: error.message });
    }
  }

  
  return {
    listarConversas,
    listarMensagens,
    marcarComoLida,
  };
}

module.exports = ChatController;