const { Pedido } = require("../model/Pedido");
const { Usuario } = require("../model/Usuarios");
const { Produto } = require("../model/Produto");

async function listarPedidos(filtros = {}) {
  return Pedido.findAll({
    where: filtros,
    include: [
      { association: "Produto", attributes: ["produto_id", "nome", "valor", "foto_principal", "menu"] },
      { association: "Cliente", attributes: ["usuario_id", "nome", "email", "role", "telefone"] },
      { association: "Empresa", attributes: ["usuario_id", "nome", "email", "role", "telefone"] }
    ],
    order: [["data_cadastro", "DESC"]],
  });
}

async function buscarPedidoPorId(id) {
  const pedido = await Pedido.findByPk(id, { 
    include: [
      { association: "Produto", attributes: ["produto_id", "nome", "valor", "foto_principal", "menu"] },
      { association: "Cliente", attributes: ["usuario_id", "nome", "email", "role", "telefone"] },
      { association: "Empresa", attributes: ["usuario_id", "nome", "email", "role", "telefone"] }
    ] 
  });
  if (!pedido) throw new Error("Pedido não encontrado");
  return pedido;
}

async function criarPedido(payload) {
  const { produto_id, cliente_id, empresa_id, quantidade, data_hora_entrega, status, observacao } = payload;
  
  if (!produto_id || !cliente_id || !empresa_id || !data_hora_entrega) {
    throw new Error("'produto_id', 'cliente_id', 'empresa_id' e 'data_hora_entrega' são obrigatórios");
  }

  // Validar se produto existe
  const produto = await Produto.findByPk(produto_id);
  if (!produto) {
    throw new Error("Produto não encontrado");
  }

  // Validar se empresa está autorizada a usar este produto
  if (produto.empresas_autorizadas && produto.empresas_autorizadas.length > 0) {
    if (!produto.empresas_autorizadas.includes(empresa_id)) {
      throw new Error("Empresa não autorizada a usar este produto");
    }
  }

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
    produto_id,
    cliente_id,
    empresa_id,
    quantidade: quantidade || 1,
    data_hora_entrega, 
    status: status || "pendente", 
    observacao: observacao || null 
  });
}

async function atualizarPedido(id, dados) {
  const pedido = await buscarPedidoPorId(id);

  // Validação adicional: Se alterando cliente, checar permissão (ex: admin)
  if (dados.cliente_id && dados.cliente_id !== pedido.cliente_id) {
    // Exemplo: throw new Error("Não autorizado a alterar cliente do pedido");
  }

  return pedido.update(dados);
}

async function cancelarPedido(id) {
  const pedido = await buscarPedidoPorId(id);
  return pedido.update({ status: "cancelado" });
}

async function deletarPedido(id) {
  const pedido = await buscarPedidoPorId(id);
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