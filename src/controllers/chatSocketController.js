const { Conversa } = require("../model/Conversa");
const { Mensagem } = require("../model/Mensagem");
const { Usuario } = require("../model/Usuarios");
const { Sequelize } = require("sequelize");
const chatRepository = require("../repositories/chatRepository");

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

function ChatSocketController(io) {
  const handleSocketConnection = (socket) => {
    console.log(`Socket conectado: ${socket.id}, Usuário: ${socket.user.email}`);

    // Join user-specific room
    socket.join(`user:${socket.user.usuario_id}`);

    socket.on("sendMessage", async (data) => {
      const { destinatario_id, conteudo } = data;

      try {
        // Validar entrada
        if (!destinatario_id || !conteudo) {
          throw new Error("Dados incompletos: destinatario_id e conteudo são obrigatórios");
        }

        // Verificar destinatário
        const destinatario = await Usuario.findByPk(destinatario_id);
        if (!destinatario) {
          throw new Error("Destinatário não encontrado");
        }

        // Validar permissões de conversa
        const podeConversar = validarPermissaoConversa(socket.user.role, destinatario.role);
        if (!podeConversar) {
          throw new Error("Conversa não permitida entre estes tipos de usuário");
        }

    

        // Criar ou obter conversa
        const conversa = await chatRepository.criarConversaSeNaoExistir(
          socket.user.usuario_id,
          destinatario_id
        );

        // Salvar mensagem no banco de dados
        const mensagem = await Mensagem.create({
          conversa_id: conversa.conversa_id,
          remetente_id: socket.user.usuario_id,
          conteudo,
          data_envio: new Date(),
        });

        const mensagemData = {
          mensagem_id: mensagem.mensagem_id,
          conversa_id: conversa.conversa_id,
          remetente_id: socket.user.usuario_id,
          conteudo,
          data_envio: mensagem.data_envio,
          lida: mensagem.lida,
        };

        // Emitir mensagem para o destinatário e o remetente
        io.to(`user:${destinatario_id}`).emit("receivedMessage", mensagemData);
        socket.emit("receivedMessage", mensagemData);
      } catch (error) {
        console.error("Erro ao enviar mensagem:", error.message);
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("disconnect", () => {
      console.log(`Socket desconectado: ${socket.id}`);
    });
  };

  return { handleSocketConnection };
}

module.exports = ChatSocketController;