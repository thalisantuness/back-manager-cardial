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

        // Normalizar conversa: cliente sempre usuario1, empresa pai sempre usuario2
        let usuario1_id, usuario2_id;
        
        if (socket.user.role === 'cliente') {
          // Cliente enviando mensagem: normalizar para empresa pai
          const normalizada = await chatRepository.normalizarConversa(socket.user.usuario_id, destinatario_id);
          usuario1_id = normalizada.usuario1_id;
          usuario2_id = normalizada.usuario2_id;
        } else if (socket.user.role === 'empresa' || socket.user.role === 'empresa-funcionario') {
          // Empresa/funcionário enviando mensagem: normalizar para empresa pai como usuario2
          const empresaPaiId = await chatRepository.buscarEmpresaPaiId(socket.user.usuario_id);
          if (!empresaPaiId) {
            throw new Error("Empresa não encontrada");
          }
          usuario1_id = destinatario_id; // Cliente sempre usuario1
          usuario2_id = empresaPaiId; // Empresa pai sempre usuario2
        } else {
          throw new Error("Apenas clientes, empresas e funcionários podem enviar mensagens");
        }

        // Criar ou obter conversa normalizada
        const conversa = await chatRepository.criarConversaSeNaoExistir(
          usuario1_id,
          usuario2_id
        );

        // Atualizar ultima_mensagem da conversa
        await conversa.update({ ultima_mensagem: new Date() });

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

        // Lógica de envio baseada no remetente
        if (socket.user.role === 'cliente') {
          // Cliente enviando: enviar para empresa pai + todos os funcionários
          const funcionariosIds = await chatRepository.buscarFuncionariosEmpresa(usuario2_id);
          
          // Enviar para empresa pai
          io.to(`user:${usuario2_id}`).emit("receivedMessage", mensagemData);
          
          // Enviar para cada funcionário
          funcionariosIds.forEach(funcionarioId => {
            io.to(`user:${funcionarioId}`).emit("receivedMessage", mensagemData);
          });
          
          console.log(`📤 Cliente ${socket.user.usuario_id} enviou mensagem para empresa ${usuario2_id} e ${funcionariosIds.length} funcionário(s)`);
        } else {
          // Empresa/funcionário enviando: enviar apenas para o cliente
          io.to(`user:${usuario1_id}`).emit("receivedMessage", mensagemData);
          
          console.log(`📤 ${socket.user.role} ${socket.user.usuario_id} enviou mensagem para cliente ${usuario1_id}`);
        }

        // Confirmar para o remetente
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