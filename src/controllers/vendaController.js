const vendaRepository = require('../repositories/vendaRepository');

function VendaController() {

  async function getVendas(req, res) {
    try {
      const vendas = await vendaRepository.listarVendas();

      if (vendas.length === 0) {
        return res.status(404).json({ error: 'Nenhuma venda encontrada' });
      }

      res.json(vendas);
    } catch (error) {
      console.error('Erro ao obter vendas:', error);
      res.status(500).json({ error: 'Erro ao obter vendas' });
    }
  }

  async function getVendaById(req, res) {
    try {
      const { id } = req.params;
      const venda = await vendaRepository.buscarVendaPorId(id);

      if (!venda) {
        return res.status(404).json({ error: 'Venda não encontrada' });
      }

      res.json(venda);
    } catch (error) {
      console.error('Erro ao buscar venda:', error);
      res.status(500).json({ error: 'Erro ao buscar venda' });
    }
  }

  async function postVenda(req, res) {
    try {
      const { usuario_id, itens, status = 'finalizada' } = req.body;

      // Validações básicas
      if (!usuario_id) {
        return res.status(400).json({ error: 'O ID do usuário é obrigatório' });
      }

      if (!itens || itens.length === 0) {
        return res.status(400).json({ error: 'A venda deve conter pelo menos um item' });
      }

      // Valida cada item
      for (const item of itens) {
        if (!item.produto_id || !item.quantidade || !item.preco_unitario) {
          return res.status(400).json({ error: 'Cada item deve conter produto_id, quantidade e preco_unitario' });
        }
        if (item.quantidade <= 0) {
          return res.status(400).json({ error: 'A quantidade deve ser maior que zero' });
        }
      }

      const novaVenda = await vendaRepository.criarVenda({
        usuario_id,
        itens,
        status
      });

      res.status(201).json(novaVenda);
    } catch (error) {
      console.error('Erro ao criar venda:', error);
      res.status(500).json({ 
        error: error.message || 'Erro ao criar venda',
        details: error.errors || null
      });
    }
  }

  async function patchCancelarVenda(req, res) {
    try {
      const { id } = req.params;

      const vendaCancelada = await vendaRepository.cancelarVenda(id);
      res.json(vendaCancelada);
    } catch (error) {
      console.error('Erro ao cancelar venda:', error);
      res.status(500).json({ 
        error: error.message || 'Erro ao cancelar venda',
        details: error.errors || null
      });
    }
  }

  async function deleteVenda(req, res) {
    try {
      const { id } = req.params;

      const resultado = await vendaRepository.deletarVenda(id);
      res.json(resultado);
    } catch (error) {
      console.error('Erro ao deletar venda:', error);
      res.status(500).json({ 
        error: error.message || 'Erro ao deletar venda',
        details: error.errors || null
      });
    }
  }

  return {
    getVendas,
    getVendaById,
    postVenda,
    patchCancelarVenda,
    deleteVenda
  };
}

module.exports = VendaController;