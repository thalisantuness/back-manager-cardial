const { Sequelize } = require("sequelize");
const { Usuario } = require("../model/Usuarios");
const { Conversa } = require("../model/Conversa");
const { Mensagem } = require("../model/Mensagem");
const sequelize = require("../utils/db");

async function criarConversaSeNaoExistir(usuario1_id, usuario2_id) {
  return await sequelize.transaction(async (t) => {
    // Buscar conversa existente (sempre normalizada: cliente=usuario1, empresa=usuario2)
    // Não precisa verificar ordem inversa porque sempre normalizamos antes de chamar
    let conversa = await Conversa.findOne({
      where: {
        usuario1_id,
        usuario2_id
      },
      transaction: t,
    });

    if (!conversa) {
      conversa = await Conversa.create(
        {
          usuario1_id,
          usuario2_id,
          ultima_mensagem: new Date(),
        },
        { transaction: t }
      );
    }

    return conversa;
  });
}

async function listarConversas(usuario_id) {
  // Buscar dados do usuário para verificar role e empresa_pai_id
  const usuario = await Usuario.findByPk(usuario_id, {
    attributes: ['usuario_id', 'role', 'empresa_pai_id']
  });
  
  if (!usuario) {
    return [];
  }
  
  let whereClause;
  
  // Cliente vê conversas onde ele é usuario1_id
  if (usuario.role === 'cliente') {
    whereClause = { usuario1_id: usuario_id };
  }
  // Empresa vê conversas onde ela é usuario2_id
  else if (usuario.role === 'empresa' && !usuario.empresa_pai_id) {
    whereClause = { usuario2_id: usuario_id };
  }
  // Funcionário vê conversas da empresa pai (onde empresa pai é usuario2_id)
  else if (usuario.role === 'empresa-funcionario' && usuario.empresa_pai_id) {
    whereClause = { usuario2_id: usuario.empresa_pai_id };
  }
  // Empresa filha vê conversas da empresa pai
  else if (usuario.role === 'empresa' && usuario.empresa_pai_id) {
    whereClause = { usuario2_id: usuario.empresa_pai_id };
  }
  // Admin ou outros casos: não retorna conversas
  else {
    return [];
  }
  
  return await Conversa.findAll({
    where: whereClause,
    include: [
      {
        model: Usuario,
        as: "Usuario1",
        attributes: ["usuario_id", "nome", "email", "foto_perfil", "role"],
      },
      {
        model: Usuario,
        as: "Usuario2",
        attributes: ["usuario_id", "nome", "email", "foto_perfil", "role"],
      },
    ],
    order: [["ultima_mensagem", "DESC"]],
  });
}

async function listarMensagens(conversa_id, usuario_id) {
  // Buscar dados do usuário para verificar role e empresa_pai_id
  const usuario = await Usuario.findByPk(usuario_id, {
    attributes: ['usuario_id', 'role', 'empresa_pai_id']
  });
  
  if (!usuario) {
    throw new Error("Usuário não encontrado");
  }
  
  const conversa = await Conversa.findByPk(conversa_id);
  
  if (!conversa) {
    throw new Error("Conversa não encontrada");
  }
  
  // Validar acesso à conversa
  let temAcesso = false;
  
  // Cliente pode ver se ele é usuario1_id
  if (usuario.role === 'cliente') {
    temAcesso = conversa.usuario1_id === usuario_id;
  }
  // Empresa pode ver se ela é usuario2_id
  else if (usuario.role === 'empresa' && !usuario.empresa_pai_id) {
    temAcesso = conversa.usuario2_id === usuario_id;
  }
  // Funcionário pode ver se a empresa pai é usuario2_id
  else if (usuario.role === 'empresa-funcionario' && usuario.empresa_pai_id) {
    temAcesso = conversa.usuario2_id === usuario.empresa_pai_id;
  }
  // Empresa filha pode ver se a empresa pai é usuario2_id
  else if (usuario.role === 'empresa' && usuario.empresa_pai_id) {
    temAcesso = conversa.usuario2_id === usuario.empresa_pai_id;
  }
  
  if (!temAcesso) {
    throw new Error("Acesso não autorizado a esta conversa");
  }
  
  return await Mensagem.findAll({
    where: { conversa_id },
    include: [
      {
        model: Usuario,
        as: "Remetente",
        attributes: ["usuario_id", "nome", "email", "foto_perfil", "role"],
      },
    ],
    order: [["data_envio", "ASC"]],
  });
}

async function marcarMensagemComoLida(mensagem_id, usuario_id) {
  // Buscar dados do usuário para verificar role e empresa_pai_id
  const usuario = await Usuario.findByPk(usuario_id, {
    attributes: ['usuario_id', 'role', 'empresa_pai_id']
  });
  
  if (!usuario) {
    throw new Error("Usuário não encontrado");
  }
  
  const mensagem = await Mensagem.findOne({
    where: { mensagem_id },
    include: [{ model: Conversa }],
  });
  
  if (!mensagem) {
    throw new Error("Mensagem não encontrada");
  }
  
  const conversa = mensagem.Conversa;
  
  // Validar acesso à conversa
  let temAcesso = false;
  
  // Cliente pode marcar se ele é usuario1_id
  if (usuario.role === 'cliente') {
    temAcesso = conversa.usuario1_id === usuario_id;
  }
  // Empresa pode marcar se ela é usuario2_id
  else if (usuario.role === 'empresa' && !usuario.empresa_pai_id) {
    temAcesso = conversa.usuario2_id === usuario_id;
  }
  // Funcionário pode marcar se a empresa pai é usuario2_id
  else if (usuario.role === 'empresa-funcionario' && usuario.empresa_pai_id) {
    temAcesso = conversa.usuario2_id === usuario.empresa_pai_id;
  }
  // Empresa filha pode marcar se a empresa pai é usuario2_id
  else if (usuario.role === 'empresa' && usuario.empresa_pai_id) {
    temAcesso = conversa.usuario2_id === usuario.empresa_pai_id;
  }
  
  if (!temAcesso) {
    throw new Error("Acesso não autorizado a esta mensagem");
  }
  
  return await mensagem.update({ lida: true });
}

/**
 * Busca o ID da empresa pai de um usuário
 * @param {number} usuario_id - ID do usuário
 * @returns {Promise<number|null>} ID da empresa pai ou null
 */
async function buscarEmpresaPaiId(usuario_id) {
  const usuario = await Usuario.findByPk(usuario_id, {
    attributes: ['usuario_id', 'role', 'empresa_pai_id']
  });
  
  if (!usuario) return null;
  
  // Se é empresa (sem empresa_pai_id), retorna o próprio ID
  if (usuario.role === 'empresa' && !usuario.empresa_pai_id) {
    return usuario.usuario_id;
  }
  
  // Se é funcionário, retorna empresa_pai_id
  if (usuario.role === 'empresa-funcionario' && usuario.empresa_pai_id) {
    return usuario.empresa_pai_id;
  }
  
  // Se é empresa filha (tem empresa_pai_id), retorna empresa_pai_id
  if (usuario.role === 'empresa' && usuario.empresa_pai_id) {
    return usuario.empresa_pai_id;
  }
  
  return null;
}

/**
 * Busca todos os funcionários de uma empresa pai
 * @param {number} empresa_pai_id - ID da empresa pai
 * @returns {Promise<number[]>} Array com IDs dos funcionários
 */
async function buscarFuncionariosEmpresa(empresa_pai_id) {
  const funcionarios = await Usuario.findAll({
    where: {
      role: 'empresa-funcionario',
      empresa_pai_id: empresa_pai_id
    },
    attributes: ['usuario_id']
  });
  
  return funcionarios.map(f => f.usuario_id);
}

/**
 * Normaliza uma conversa: cliente sempre como usuario1, empresa pai sempre como usuario2
 * @param {number} cliente_id - ID do cliente
 * @param {number} destinatario_id - ID do destinatário (pode ser empresa ou funcionário)
 * @returns {Promise<{usuario1_id: number, usuario2_id: number}>} IDs normalizados
 */
async function normalizarConversa(cliente_id, destinatario_id) {
  const destinatario = await Usuario.findByPk(destinatario_id, {
    attributes: ['usuario_id', 'role', 'empresa_pai_id']
  });
  
  if (!destinatario) {
    throw new Error('Destinatário não encontrado');
  }
  
  let empresa_pai_id;
  
  // Se destinatário é funcionário, buscar empresa_pai_id
  if (destinatario.role === 'empresa-funcionario') {
    if (!destinatario.empresa_pai_id) {
      throw new Error('Funcionário não vinculado a uma empresa');
    }
    empresa_pai_id = destinatario.empresa_pai_id;
  } 
  // Se destinatário é empresa pai (sem empresa_pai_id), usar diretamente
  else if (destinatario.role === 'empresa' && !destinatario.empresa_pai_id) {
    empresa_pai_id = destinatario.usuario_id;
  }
  // Se destinatário é empresa filha (tem empresa_pai_id), usar empresa_pai_id
  else if (destinatario.role === 'empresa' && destinatario.empresa_pai_id) {
    empresa_pai_id = destinatario.empresa_pai_id;
  }
  else {
    throw new Error('Destinatário deve ser empresa ou funcionário');
  }
  
  return {
    usuario1_id: cliente_id,
    usuario2_id: empresa_pai_id
  };
}

module.exports = {
  listarConversas,
  listarMensagens,
  marcarMensagemComoLida,
  criarConversaSeNaoExistir,
  buscarEmpresaPaiId,
  buscarFuncionariosEmpresa,
  normalizarConversa,
};