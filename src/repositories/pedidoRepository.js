const { Pedido } = require("../model/Pedido");
const { Usuario } = require("../model/Usuarios");
const { Projeto } = require("../model/Projeto");

async function listarPedidos(filtros = {}) {
  const pedidos = await Pedido.findAll({
    where: filtros,
    include: [
      { 
        association: "Projeto", 
        attributes: ["projeto_id", "nome", "valor", "foto_principal", "empresa_id"],
        required: false  // LEFT JOIN - permite pedidos sem projeto
      },
      { 
        association: "Cliente", 
        attributes: ["usuario_id", "nome", "email", "role", "telefone", "cliente_endereco"],
        required: false
      },
      { 
        association: "Empresa", 
        attributes: ["usuario_id", "nome", "email", "role", "telefone"],
        required: false
      }
    ],
    order: [["data_cadastro", "DESC"]],
  });

  // Formatar resposta para garantir que campos null não quebrem o frontend
  return pedidos.map(pedido => {
    const pedidoData = pedido.toJSON();
    
    // Se Projeto for null, adicionar objeto vazio para evitar erro no frontend
    if (!pedidoData.Projeto) {
      pedidoData.Projeto = {
        projeto_id: pedidoData.projeto_id,
        nome: "Projeto removido",
        valor: 0,
        foto_principal: null,
        empresa_id: null
      };
    }

    return pedidoData;
  });
}

async function buscarPedidoPorId(id) {
  const pedido = await Pedido.findByPk(id, { 
    include: [
      { 
        association: "Projeto", 
        attributes: ["projeto_id", "nome", "valor", "foto_principal", "empresa_id"],
        required: false
      },
      { 
        association: "Cliente", 
        attributes: ["usuario_id", "nome", "email", "role", "telefone", "cliente_endereco"],
        required: false
      },
      { 
        association: "Empresa", 
        attributes: ["usuario_id", "nome", "email", "role", "telefone"],
        required: false
      }
    ] 
  });
  if (!pedido) throw new Error("Pedido não encontrado");
  
  const pedidoData = pedido.toJSON();
  
  // Se Projeto for null, adicionar objeto vazio para evitar erro no frontend
  if (!pedidoData.Projeto) {
      pedidoData.Projeto = {
        projeto_id: pedidoData.projeto_id,
        nome: "Projeto removido",
        valor: 0,
        foto_principal: null,
        empresa_id: null
      };
  }
  
  return pedidoData;
}

async function criarPedido(payload) {
  const { projeto_id, cliente_id, empresa_id, quantidade, data_hora_entrega, status, observacao } = payload;
  
  if (!projeto_id || !cliente_id || !empresa_id) {
    throw new Error("'projeto_id', 'cliente_id' e 'empresa_id' são obrigatórios");
  }
  
  // data_hora_entrega é opcional (pode ser null)

  // Validar se projeto existe
  const projeto = await Projeto.findByPk(projeto_id);
  if (!projeto) {
    throw new Error("Projeto não encontrado");
  }

  // Validação de empresas_autorizadas desativada temporariamente
  // if (projeto.empresas_autorizadas && projeto.empresas_autorizadas.length > 0) {
  //   if (!projeto.empresas_autorizadas.includes(empresa_id)) {
  //     throw new Error("Empresa não autorizada a usar este projeto");
  //   }
  // }

  // Validar se cliente existe
  const cliente = await Usuario.findByPk(cliente_id);
  if (!cliente) {
    throw new Error("Cliente não encontrado");
  }

  // Validar se empresa existe
  const empresa = await Usuario.findByPk(empresa_id);
  if (!empresa) {
    throw new Error("Empresa não encontrada");
  }

  return Pedido.create({ 
    projeto_id,
    cliente_id,
    empresa_id,
    quantidade: quantidade || 1,
    data_hora_entrega, 
    status: status || "pendente", 
    observacao: observacao || null 
  });
}

async function atualizarPedido(id, dados) {
  // Buscar pedido como instância do Sequelize (sem .toJSON())
  const pedido = await Pedido.findByPk(id, {
    include: [
      { 
        association: "Projeto", 
        attributes: ["projeto_id", "nome", "valor", "foto_principal", "empresa_id"],
        required: false
      },
      { 
        association: "Cliente", 
        attributes: ["usuario_id", "nome", "email", "role", "telefone", "cliente_endereco"],
        required: false
      },
      { 
        association: "Empresa", 
        attributes: ["usuario_id", "nome", "email", "role", "telefone"],
        required: false
      }
    ]
  });

  if (!pedido) {
    throw new Error("Pedido não encontrado");
  }

  // Validação adicional: Se alterando cliente, checar permissão (ex: admin)
  if (dados.cliente_id && dados.cliente_id !== pedido.cliente_id) {
    // Exemplo: throw new Error("Não autorizado a alterar cliente do pedido");
  }

  await pedido.update(dados);
  
  // Retornar pedido atualizado formatado
  return buscarPedidoPorId(id);
}

async function cancelarPedido(id) {
  const pedido = await Pedido.findByPk(id);
  if (!pedido) {
    throw new Error("Pedido não encontrado");
  }
  
  await pedido.update({ status: "cancelado" });
  return buscarPedidoPorId(id);
}

async function deletarPedido(id) {
  const pedido = await Pedido.findByPk(id);
  if (!pedido) {
    throw new Error("Pedido não encontrado");
  }
  return pedido.destroy();
}

module.exports = {
  listarPedidos,
  buscarPedidoPorId,
  criarPedido,
  atualizarPedido,
  cancelarPedido,
  deletarPedido,
};