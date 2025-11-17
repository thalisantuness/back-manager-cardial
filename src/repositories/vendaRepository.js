const { Venda, ItemVenda } = require('../model/Venda');
const { Produto } = require('../model/Produto');
const { Usuario } = require('../model/Usuarios');

async function listarVendas() {
  return await Venda.findAll({
    include: [
      { 
        model: Usuario, 
        as: 'usuario', 
        attributes: ['usuario_id', 'nome'] 
      },
      {
        model: ItemVenda,
        as: 'itens',
        include: [{
          model: Produto,
          as: 'produto',
          attributes: ['produto_id', 'nome']
        }]
      }
    ],
    order: [['data_venda', 'DESC']]
  });
}

async function buscarVendaPorId(id) {
  return await Venda.findByPk(id, {
    include: [
      { 
        model: Usuario, 
        as: 'usuario', 
        attributes: ['usuario_id', 'nome'] 
      },
      {
        model: ItemVenda,
        as: 'itens',
        include: [{
          model: Produto,
          as: 'produto',
          attributes: ['produto_id', 'nome', 'preco']
        }]
      }
    ]
  });
}

async function criarVenda(dadosVenda) {
  const { usuario_id, itens, status = 'finalizada' } = dadosVenda;

  if (!usuario_id) {
    throw new Error('O usuario_id é obrigatório');
  }

  if (!itens || itens.length === 0) {
    throw new Error('A venda deve conter pelo menos um item');
  }

  // Calcula o total da venda
  const total = itens.reduce((sum, item) => sum + (item.preco_unitario * item.quantidade), 0);

  // Cria a venda usando transação para garantir atomicidade
  const transaction = await sequelize.transaction();
  
  try {
    const venda = await Venda.create({
      usuario_id,
      total,
      status
    }, { transaction });

    // Cria os itens da venda
    const itensCriados = await Promise.all(itens.map(async (item) => {
      const produto = await Produto.findByPk(item.produto_id, { transaction });
      
      if (!produto) {
        throw new Error(`Produto com ID ${item.produto_id} não encontrado`);
      }

      if (produto.quantidade < item.quantidade) {
        throw new Error(`Quantidade insuficiente em estoque para o produto ${produto.nome}`);
      }

      // Atualiza o estoque do produto
      await produto.update({
        quantidade: produto.quantidade - item.quantidade
      }, { transaction });

      return await ItemVenda.create({
        venda_id: venda.venda_id,
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
        subtotal: item.preco_unitario * item.quantidade
      }, { transaction });
    }));

    await transaction.commit();
    
    // Retorna a venda com seus itens
    return await Venda.findByPk(venda.venda_id, {
      include: [
        { model: Usuario, as: 'usuario' },
        { model: ItemVenda, as: 'itens' }
      ]
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function cancelarVenda(id) {
  const transaction = await sequelize.transaction();
  
  try {
    const venda = await Venda.findByPk(id, {
      include: [{ model: ItemVenda, as: 'itens' }],
      transaction
    });

    if (!venda) {
      throw new Error('Venda não encontrada');
    }

    if (venda.status === 'cancelada') {
      throw new Error('Venda já está cancelada');
    }

    // Devolve os produtos ao estoque
    await Promise.all(venda.itens.map(async (item) => {
      const produto = await Produto.findByPk(item.produto_id, { transaction });
      await produto.update({
        quantidade: produto.quantidade + item.quantidade
      }, { transaction });
    }));

    // Atualiza o status da venda
    await venda.update({ status: 'cancelada' }, { transaction });

    await transaction.commit();
    return venda;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function deletarVenda(id) {
  const venda = await Venda.findByPk(id);

  if (!venda) {
    throw new Error('Venda não encontrada');
  }

  // Não permite deletar vendas finalizadas, apenas cancela
  if (venda.status === 'finalizada') {
    throw new Error('Vendas finalizadas não podem ser deletadas, apenas canceladas');
  }

  await venda.destroy();
  return { message: 'Venda deletada com sucesso' };
}

module.exports = {
  listarVendas,
  buscarVendaPorId,
  criarVenda,
  cancelarVenda,
  deletarVenda
};