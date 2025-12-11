const { Pedido } = require("../model/Pedido");
const { Projeto } = require("../model/Projeto");
const { Sequelize } = require("sequelize");
const sequelize = require("../utils/db");

/**
 * Busca todos os pedidos com informações de projeto para cálculos financeiros
 * Filtra apenas pedidos entregues ou confirmados (não cancelados)
 */
async function buscarPedidosParaFaturamento(filtros = {}) {
  const where = {
    status: {
      [Sequelize.Op.notIn]: ['cancelado']
    }
  };

  // Filtro por empresa se fornecido
  if (filtros.empresa_id) {
    where.empresa_id = filtros.empresa_id;
  }

  // Filtro por período se fornecido
  if (filtros.data_inicio || filtros.data_fim) {
    where.data_cadastro = {};
    if (filtros.data_inicio) {
      where.data_cadastro[Sequelize.Op.gte] = filtros.data_inicio;
    }
    if (filtros.data_fim) {
      where.data_cadastro[Sequelize.Op.lte] = filtros.data_fim;
    }
  }

  const pedidos = await Pedido.findAll({
    where,
    include: [
      {
        association: "Projeto",
        attributes: ["projeto_id", "nome", "valor", "valor_custo", "empresa_id"],
        required: true // INNER JOIN - apenas pedidos com projeto válido
      }
    ],
    order: [["data_cadastro", "ASC"]]
  });

  return pedidos;
}

/**
 * Busca pedidos agrupados por mês para comparação mensal
 * Retorna os pedidos para agrupamento no controller (mais confiável)
 */
async function buscarPedidosPorMes(filtros = {}) {
  const where = {
    status: {
      [Sequelize.Op.notIn]: ['cancelado']
    }
  };

  if (filtros.empresa_id) {
    where.empresa_id = filtros.empresa_id;
  }

  // Filtro por período se fornecido
  if (filtros.data_inicio || filtros.data_fim) {
    where.data_cadastro = {};
    if (filtros.data_inicio) {
      where.data_cadastro[Sequelize.Op.gte] = filtros.data_inicio;
    }
    if (filtros.data_fim) {
      where.data_cadastro[Sequelize.Op.lte] = filtros.data_fim;
    }
  }

  const pedidos = await Pedido.findAll({
    where,
    include: [
      {
        association: "Projeto",
        attributes: ["projeto_id", "nome", "valor", "valor_custo", "empresa_id"],
        required: true
      }
    ],
    order: [["data_cadastro", "ASC"]]
  });

  return pedidos;
}

module.exports = {
  buscarPedidosParaFaturamento,
  buscarPedidosPorMes
};

