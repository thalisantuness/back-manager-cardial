const repo = require("../repositories/pedidoRepository");

function PedidoController() {
  async function listar(req, res) {
    try {
      const { Op } = require('sequelize');
      const usuariosRepo = require('../repositories/usuariosRepository');
      const { projeto_id, cliente_id, empresa_id, status } = req.query;
      const filtros = {};
      if (projeto_id) filtros.projeto_id = projeto_id;
      if (cliente_id) filtros.cliente_id = cliente_id;
      if (empresa_id) filtros.empresa_id = empresa_id;
      if (status) filtros.status = status;
      
      // Lógica de filtragem baseada no role
      if (req.user) {
        if (req.user.role === 'empresa') {
          // Empresa vê seus pedidos + pedidos de todas as empresas filhas (recursivamente)
          const idsEmpresas = await usuariosRepo.buscarIdsEmpresasFilhas(req.user.usuario_id);
          filtros.empresa_id = { [Op.in]: idsEmpresas };
        } else if (req.user.role === 'empresa-funcionario') {
          // Funcionário vê pedidos da empresa pai + pedidos de todas as empresas filhas
          const funcionario = await usuariosRepo.buscarUsuarioPorId(req.user.usuario_id);
          if (funcionario && funcionario.empresa_pai_id) {
            const idsEmpresas = await usuariosRepo.buscarIdsEmpresasFilhas(funcionario.empresa_pai_id);
            filtros.empresa_id = { [Op.in]: idsEmpresas };
          } else {
            // Se não tem empresa_pai_id, retornar vazio
            return res.json([]);
          }
        } else if (req.user.role === 'cliente') {
          // Cliente vê apenas seus próprios pedidos
          filtros.cliente_id = req.user.usuario_id;
        }
        // Admin vê todos os pedidos - não filtra
      }
      
      const itens = await repo.listarPedidos(filtros);
      res.json(itens);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async function criar(req, res) {
    try {
      const { projeto_id, cliente_id, empresa_id, quantidade, data_hora_entrega, status, observacao } = req.body;
      
      // Validar autenticação
      if (!req.user) {
        return res.status(401).json({ error: 'Autenticação necessária para criar pedido' });
      }

      // Validar campos obrigatórios básicos
      if (!projeto_id) {
        return res.status(400).json({ error: 'projeto_id é obrigatório' });
      }
      
      // Determinar cliente_id e empresa_id baseado no role
      // data_hora_entrega é opcional (pode ser null para clientes)
      let clienteIdFinal = cliente_id;
      let empresaIdFinal = empresa_id;
      
      if (req.user.role === 'cliente') {
        // Cliente: preenche seu próprio ID, empresa_id deve vir do body
        clienteIdFinal = req.user.usuario_id;
        if (!empresa_id) {
          return res.status(400).json({ error: 'empresa_id é obrigatório para clientes' });
        }
      } else if (req.user.role === 'empresa') {
        // Empresa: preenche seu próprio ID, cliente_id deve vir do body
        empresaIdFinal = req.user.usuario_id;
        if (!cliente_id) {
          return res.status(400).json({ error: 'cliente_id é obrigatório para empresas' });
        }
      } else if (req.user.role === 'empresa-funcionario') {
        // Funcionário: usa empresa_pai_id, cliente_id deve vir do body
        const funcionario = await require('../repositories/usuariosRepository').buscarUsuarioPorId(req.user.usuario_id);
        if (!funcionario || !funcionario.empresa_pai_id) {
          return res.status(403).json({ error: 'Funcionário não vinculado a uma empresa' });
        }
        empresaIdFinal = funcionario.empresa_pai_id;
        if (!cliente_id) {
          return res.status(400).json({ error: 'cliente_id é obrigatório para funcionários' });
        }
      } else if (req.user.role === 'admin') {
        // Admin: pode especificar ambos ou usar seu próprio ID
        clienteIdFinal = cliente_id || req.user.usuario_id;
        empresaIdFinal = empresa_id || req.user.usuario_id;
      } else {
        // Outros roles: usar próprio ID para ambos (fallback)
        clienteIdFinal = clienteIdFinal || req.user.usuario_id;
        empresaIdFinal = empresaIdFinal || req.user.usuario_id;
      }
      
      const payload = { 
        projeto_id, 
        cliente_id: clienteIdFinal, 
        empresa_id: empresaIdFinal, 
        quantidade,
        data_hora_entrega, 
        status, 
        observacao 
      };
      
      const item = await repo.criarPedido(payload);
      res.status(201).json(item);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async function buscarPorId(req, res) {
    try {
      const item = await repo.buscarPedidoPorId(req.params.id);
      res.json(item);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  }

  async function atualizar(req, res) {
    try {
      const dados = req.body;
      // Opcional: Se alterando cliente_id, valide auth (ex: req.user)
      const item = await repo.atualizarPedido(req.params.id, dados);
      res.json(item);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async function cancelar(req, res) {
    try {
      const item = await repo.cancelarPedido(req.params.id);
      res.json(item);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async function excluir(req, res) {
    try {
      await repo.deletarPedido(req.params.id);
      res.json({ message: "Pedido excluído com sucesso" });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  return { listar, criar, buscarPorId, atualizar, cancelar, excluir };
}

module.exports = PedidoController;