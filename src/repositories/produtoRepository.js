const { Produto } = require('../model/Produto');
const { Foto } = require('../model/Foto');

async function listarProdutos(filtros = {}) {
  const produtos = await Produto.findAll({
    where: filtros,
    include: [{ model: Foto, as: 'fotos', attributes: ['photo_id', 'imageData'] }],
    order: [['data_cadastro', 'DESC']]
  });

  // Formatar os dados: padronizar para imageData (principal) e photos (secundárias)
  return produtos.map(produto => {
    const produtoData = produto.toJSON();
    
    // Criar array de fotos secundárias no formato correto
    const photos = produtoData.fotos ? produtoData.fotos.map(foto => ({
      photo_id: foto.photo_id,
      imageData: foto.imageData
    })) : [];

    return {
      produto_id: produtoData.produto_id,
      nome: produtoData.nome,
      valor: produtoData.valor,
      valor_custo: produtoData.valor_custo,
      quantidade: produtoData.quantidade,
      tipo_comercializacao: produtoData.tipo_comercializacao,
      tipo_produto: produtoData.tipo_produto,
      menu: produtoData.menu,
      empresas_autorizadas: produtoData.empresas_autorizadas,
      imageData: produtoData.foto_principal,  // Principal como imageData
      photos: photos,  // Secundárias como photos
      data_cadastro: produtoData.data_cadastro,
      data_update: produtoData.data_update
    };
  });
}

async function buscarProdutoPorId(id) {
  const produto = await Produto.findByPk(id, {
    include: [{ model: Foto, as: 'fotos', attributes: ['photo_id', 'imageData'] }]
  });

  if (!produto) return null;

  const produtoData = produto.toJSON();
  
  // Criar array de fotos secundárias no formato correto
  const photos = produtoData.fotos ? produtoData.fotos.map(foto => ({
    photo_id: foto.photo_id,
    imageData: foto.imageData
  })) : [];

  return {
    produto_id: produtoData.produto_id,
    nome: produtoData.nome,
    valor: produtoData.valor,
    valor_custo: produtoData.valor_custo,
    quantidade: produtoData.quantidade,
    tipo_comercializacao: produtoData.tipo_comercializacao,
    tipo_produto: produtoData.tipo_produto,
    menu: produtoData.menu,
    empresas_autorizadas: produtoData.empresas_autorizadas,
    imageData: produtoData.foto_principal,  // Principal como imageData
    photos: photos,  // Secundárias como photos
    data_cadastro: produtoData.data_cadastro,
    data_update: produtoData.data_update
  };
}

async function criarProduto(dados) {
  return await Produto.create(dados);
}

async function atualizarProduto(id, dados) {
  const produto = await Produto.findByPk(id);
  if (!produto) throw new Error('Produto não encontrado');
  await produto.update(dados);
  return produto;
}

async function deletarProduto(id) {
  const produto = await Produto.findByPk(id, { include: [{ model: Foto, as: 'fotos' }] });
  if (!produto) throw new Error('Produto não encontrado');
  if (produto.fotos?.length) {
    await Foto.destroy({ where: { produto_id: id } });
  }
  await produto.destroy();
  return { message: 'Produto deletado com sucesso' };
}

async function adicionarFoto(produto_id, imageData) {
  return await Foto.create({ produto_id, imageData });
}

module.exports = {
  listarProdutos,
  buscarProdutoPorId,
  criarProduto,
  atualizarProduto,
  deletarProduto,
  adicionarFoto,
};