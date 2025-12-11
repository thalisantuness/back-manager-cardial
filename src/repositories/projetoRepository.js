const { Projeto } = require('../model/Projeto');
const { Foto } = require('../model/Foto');
const { Usuario } = require('../model/Usuarios');

async function listarProjetos(filtros = {}) {
  const projetos = await Projeto.findAll({
    where: filtros,
    include: [
      { model: Foto, as: 'fotos', attributes: ['photo_id', 'imageData'] },
      { 
        association: 'Empresa', 
        attributes: ['usuario_id', 'nome', 'email', 'telefone', 'foto_perfil'],
        required: false  
      }
    ],
    order: [['data_cadastro', 'DESC']]
  });

  // Formatar os dados: padronizar para imageData (principal) e photos (secundárias)
  return projetos.map(projeto => {
    const projetoData = projeto.toJSON();
    
    // Criar array de fotos secundárias no formato correto
    const photos = projetoData.fotos ? projetoData.fotos
      .map(foto => {
        // Garantir que fotos secundárias nunca retornem base64
        let imageDataFinal = foto.imageData;
        if (imageDataFinal && imageDataFinal.startsWith('data:image')) {
          console.warn(`Foto ${foto.photo_id} tem base64. Limpando.`);
          imageDataFinal = null;
        }
        return {
          photo_id: foto.photo_id,
          imageData: imageDataFinal
        };
      })
      .filter(foto => foto.imageData !== null) // Remover fotos inválidas
      : [];

    // Garantir que nunca retornamos base64, apenas URLs do S3
    let fotoPrincipalFinal = projetoData.foto_principal;
    if (fotoPrincipalFinal && fotoPrincipalFinal.startsWith('data:image')) {
      // Se por algum motivo tiver base64 no banco, retornar null ou limpar
      console.warn(`Projeto ${projetoData.projeto_id} tem base64 em foto_principal. Limpando.`);
      fotoPrincipalFinal = null; // Não retornar base64
    }

    return {
      projeto_id: projetoData.projeto_id,
      nome: projetoData.nome,
      valor: projetoData.valor,
      valor_custo: projetoData.valor_custo,
      quantidade: projetoData.quantidade,
      tipo_comercializacao: projetoData.tipo_comercializacao,
      tipo_produto: projetoData.tipo_produto,
      empresa_id: projetoData.empresa_id,
      Empresa: projetoData.Empresa ? {
        usuario_id: projetoData.Empresa.usuario_id,
        nome: projetoData.Empresa.nome,
        email: projetoData.Empresa.email,
        telefone: projetoData.Empresa.telefone,
        foto_perfil: projetoData.Empresa.foto_perfil
      } : null,
      imageData: fotoPrincipalFinal,  // Principal como imageData (compat)
      foto_principal: fotoPrincipalFinal, // Campo explícito para o frontend
      photos: photos,  // Secundárias como photos
      data_cadastro: projetoData.data_cadastro,
      data_update: projetoData.data_update
    };
  });
}

async function buscarProjetoPorId(id) {
  const projeto = await Projeto.findByPk(id, {
    include: [
      { model: Foto, as: 'fotos', attributes: ['photo_id', 'imageData'] },
      { 
        association: 'Empresa', 
        attributes: ['usuario_id', 'nome', 'email', 'telefone', 'foto_perfil'],
        required: false
      }
    ]
  });

  if (!projeto) return null;

  const projetoData = projeto.toJSON();
  
  // Criar array de fotos secundárias no formato correto
  const photos = projetoData.fotos ? projetoData.fotos
    .map(foto => {
      // Garantir que fotos secundárias nunca retornem base64
      let imageDataFinal = foto.imageData;
      if (imageDataFinal && imageDataFinal.startsWith('data:image')) {
        console.warn(`Foto ${foto.photo_id} tem base64. Limpando.`);
        imageDataFinal = null;
      }
      return {
        photo_id: foto.photo_id,
        imageData: imageDataFinal
      };
    })
    .filter(foto => foto.imageData !== null) // Remover fotos inválidas
    : [];

  // Garantir que nunca retornamos base64, apenas URLs do S3
  let fotoPrincipalFinal = projetoData.foto_principal;
  if (fotoPrincipalFinal && fotoPrincipalFinal.startsWith('data:image')) {
    // Se por algum motivo tiver base64 no banco, retornar null ou limpar
    console.warn(`Projeto ${projetoData.projeto_id} tem base64 em foto_principal. Limpando.`);
    fotoPrincipalFinal = null; // Não retornar base64
  }

  return {
    projeto_id: projetoData.projeto_id,
    nome: projetoData.nome,
    valor: projetoData.valor,
    valor_custo: projetoData.valor_custo,
    quantidade: projetoData.quantidade,
    tipo_comercializacao: projetoData.tipo_comercializacao,
    tipo_produto: projetoData.tipo_produto,
    empresa_id: projetoData.empresa_id,
    Empresa: projetoData.Empresa ? {
      usuario_id: projetoData.Empresa.usuario_id,
      nome: projetoData.Empresa.nome,
      email: projetoData.Empresa.email,
      telefone: projetoData.Empresa.telefone,
      foto_perfil: projetoData.Empresa.foto_perfil
    } : null,
    imageData: fotoPrincipalFinal,  // Principal como imageData (compat)
    foto_principal: fotoPrincipalFinal, // Campo explícito para o frontend
    photos: photos,  // Secundárias como photos
    data_cadastro: projetoData.data_cadastro,
    data_update: projetoData.data_update
  };
}

async function criarProjeto(dados) {
  return await Projeto.create(dados);
}

async function atualizarProjeto(id, dados) {
  const projeto = await Projeto.findByPk(id);
  if (!projeto) throw new Error('Projeto não encontrado');
  await projeto.update(dados);
  return projeto;
}

async function deletarProjeto(id) {
  const projeto = await Projeto.findByPk(id, { include: [{ model: Foto, as: 'fotos' }] });
  if (!projeto) throw new Error('Projeto não encontrado');
  if (projeto.fotos?.length) {
    await Foto.destroy({ where: { projeto_id: id } });
  }
  await projeto.destroy();
  return { message: 'Projeto deletado com sucesso' };
}

async function adicionarFoto(projeto_id, imageData) {
  return await Foto.create({ projeto_id, imageData });
}

async function deletarFoto(projeto_id, photo_id) {
  const foto = await Foto.findOne({ 
    where: { photo_id, projeto_id }
  });
  
  if (!foto) {
    throw new Error('Foto não encontrada ou não pertence a este projeto');
  }
  
  await foto.destroy();
  return { message: 'Foto deletada com sucesso' };
}

module.exports = {
  listarProjetos,
  buscarProjetoPorId,
  criarProjeto,
  atualizarProjeto,
  deletarProjeto,
  adicionarFoto,
  deletarFoto,
};

