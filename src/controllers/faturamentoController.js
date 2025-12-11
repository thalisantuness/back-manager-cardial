const faturamentoRepository = require('../repositories/faturamentoRepository');

function FaturamentoController() {

  /**
   * Calcula todas as métricas financeiras e retorna dados para gráficos
   * GET /grafico-faturamentos
   * Query params opcionais:
   * - empresa_id: filtrar por empresa
   * - data_inicio: data inicial (YYYY-MM-DD)
   * - data_fim: data final (YYYY-MM-DD)
   */
  async function getGraficoFaturamentos(req, res) {
    try {
      const { empresa_id, data_inicio, data_fim } = req.query;
      
      const filtros = {};
      if (empresa_id) filtros.empresa_id = parseInt(empresa_id);
      if (data_inicio) filtros.data_inicio = new Date(data_inicio);
      if (data_fim) filtros.data_fim = new Date(data_fim);

      // Buscar todos os pedidos para cálculos gerais
      const pedidos = await faturamentoRepository.buscarPedidosParaFaturamento(filtros);
      
      // Buscar pedidos para agrupamento por mês
      const pedidosPorMes = await faturamentoRepository.buscarPedidosPorMes(filtros);

      // Calcular métricas gerais
      let faturamentoBruto = 0;
      let custoTotal = 0;
      let totalPedidos = 0;

      pedidos.forEach(pedido => {
        const projeto = pedido.Projeto;
        if (projeto && projeto.valor && projeto.valor_custo) {
          const valorVenda = parseFloat(projeto.valor) * pedido.quantidade;
          const valorCusto = parseFloat(projeto.valor_custo) * pedido.quantidade;
          
          faturamentoBruto += valorVenda;
          custoTotal += valorCusto;
          totalPedidos += 1;
        }
      });

      // Calcular lucros
      const lucroBruto = faturamentoBruto - custoTotal;
      const lucroLiquido = lucroBruto; // Por enquanto igual ao bruto (sem despesas no modelo)

      // Calcular margens
      const margemBruta = faturamentoBruto > 0 
        ? ((lucroBruto / faturamentoBruto) * 100).toFixed(2) 
        : 0;
      
      const margemLiquida = faturamentoBruto > 0 
        ? ((lucroLiquido / faturamentoBruto) * 100).toFixed(2) 
        : 0;

      // Calcular ROI (Retorno sobre Investimento)
      const roi = custoTotal > 0 
        ? ((lucroBruto / custoTotal) * 100).toFixed(2) 
        : 0;

      // Agrupar pedidos por mês para comparação
      const pedidosAgrupadosPorMes = {};
      
      pedidosPorMes.forEach(pedido => {
        const projeto = pedido.Projeto;
        if (!projeto || !projeto.valor || !projeto.valor_custo) {
          return;
        }

        const dataPedido = new Date(pedido.data_cadastro);
        const mesAno = `${dataPedido.getFullYear()}-${String(dataPedido.getMonth() + 1).padStart(2, '0')}`;
        
        if (!pedidosAgrupadosPorMes[mesAno]) {
          pedidosAgrupadosPorMes[mesAno] = {
            mes: mesAno,
            faturamento_bruto: 0,
            custo_total: 0,
            total_pedidos: 0
          };
        }

        const valorVenda = parseFloat(projeto.valor) * pedido.quantidade;
        const valorCusto = parseFloat(projeto.valor_custo) * pedido.quantidade;
        
        pedidosAgrupadosPorMes[mesAno].faturamento_bruto += valorVenda;
        pedidosAgrupadosPorMes[mesAno].custo_total += valorCusto;
        pedidosAgrupadosPorMes[mesAno].total_pedidos += 1;
      });

      // Processar dados por mês para comparação
      const comparacaoMensal = Object.values(pedidosAgrupadosPorMes)
        .map(item => {
          const faturamento = item.faturamento_bruto;
          const custo = item.custo_total;
          const lucro = faturamento - custo;
          const margem = faturamento > 0 ? ((lucro / faturamento) * 100).toFixed(2) : 0;
          
          // Formatar data do mês
          const [ano, mes] = item.mes.split('-');
          const dataMes = new Date(parseInt(ano), parseInt(mes) - 1, 1);
          const mesAnoFormatado = `${dataMes.toLocaleString('pt-BR', { month: 'long' })}/${ano}`;
          const mesNumero = parseInt(mes);
          const anoNumero = parseInt(ano);

          return {
            mes: mesAnoFormatado,
            mes_numero: mesNumero,
            ano: anoNumero,
            faturamento_bruto: parseFloat(faturamento.toFixed(2)),
            custo_total: parseFloat(custo.toFixed(2)),
            lucro_bruto: parseFloat(lucro.toFixed(2)),
            lucro_liquido: parseFloat(lucro.toFixed(2)),
            margem_bruta: parseFloat(margem),
            margem_liquida: parseFloat(margem),
            roi: custo > 0 ? parseFloat(((lucro / custo) * 100).toFixed(2)) : 0,
            total_pedidos: item.total_pedidos
          };
        })
        .sort((a, b) => {
          // Ordenar por ano e mês
          if (a.ano !== b.ano) return a.ano - b.ano;
          return a.mes_numero - b.mes_numero;
        });

      // Calcular variação percentual entre meses (se houver mais de um mês)
      const comparacaoComVariacao = comparacaoMensal.map((mes, index) => {
        if (index === 0) {
          return {
            ...mes,
            variacao_faturamento: null,
            variacao_lucro: null
          };
        }

        const mesAnterior = comparacaoMensal[index - 1];
        const variacaoFaturamento = mesAnterior.faturamento_bruto > 0
          ? (((mes.faturamento_bruto - mesAnterior.faturamento_bruto) / mesAnterior.faturamento_bruto) * 100).toFixed(2)
          : 0;
        
        const variacaoLucro = mesAnterior.lucro_bruto > 0
          ? (((mes.lucro_bruto - mesAnterior.lucro_bruto) / mesAnterior.lucro_bruto) * 100).toFixed(2)
          : 0;

        return {
          ...mes,
          variacao_faturamento: parseFloat(variacaoFaturamento),
          variacao_lucro: parseFloat(variacaoLucro)
        };
      });

      // Resposta final
      const resposta = {
        resumo_geral: {
          faturamento_bruto: parseFloat(faturamentoBruto.toFixed(2)),
          custo_total: parseFloat(custoTotal.toFixed(2)),
          lucro_bruto: parseFloat(lucroBruto.toFixed(2)),
          lucro_liquido: parseFloat(lucroLiquido.toFixed(2)),
          margem_bruta: parseFloat(margemBruta),
          margem_liquida: parseFloat(margemLiquida),
          roi: parseFloat(roi),
          total_pedidos: totalPedidos
        },
        comparacao_mensal: comparacaoComVariacao,
        filtros_aplicados: {
          empresa_id: filtros.empresa_id || null,
          data_inicio: filtros.data_inicio || null,
          data_fim: filtros.data_fim || null
        }
      };

      res.json(resposta);
    } catch (error) {
      console.error('Erro ao calcular faturamentos:', error);
      res.status(500).json({ 
        error: 'Erro ao calcular faturamentos',
        details: error.message 
      });
    }
  }

  return {
    getGraficoFaturamentos
  };
}

module.exports = FaturamentoController;

