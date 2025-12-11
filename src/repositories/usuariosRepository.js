const s3 = require("../utils/awsConfig");
const { v4: uuidv4 } = require("uuid");
const sharp = require("sharp");
const bcrypt = require("bcrypt");
const { Usuario } = require("../model/Usuarios");
const { Pedido } = require("../model/Pedido");
const sequelize = require("../utils/db");
const { Op } = require("sequelize");

// Helper para deletar um arquivo do S3 a partir da URL (igual produtos)
async function deleteFromS3(fileUrl) {
  if (!fileUrl || !fileUrl.includes(process.env.AWS_BUCKET_NAME)) {
    console.log("URL inválida ou não pertence ao bucket.");
    return;
  }
  try {
    const key = fileUrl.split('.com/')[1];
    await s3.deleteObject({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
    }).promise();
    console.log(`Arquivo deletado do S3: ${key}`);
  } catch (error) {
    console.error("Erro ao deletar arquivo do S3:", error);
  }
}

// Validação de base64 (copiado dos produtos)
function validateBase64Image(base64String) {
  if (!base64String || typeof base64String !== 'string') {
    throw new Error('String base64 inválida');
  }

  if (!base64String.startsWith('data:image/')) {
    throw new Error('String não é uma imagem base64 válida');
  }

  const parts = base64String.split(',');
  if (parts.length !== 2) {
    throw new Error('Formato base64 inválido');
  }

  const base64Data = parts[1];
  if (!base64Data || base64Data.length < 100) {
    throw new Error('Dados de imagem base64 muito pequenos ou vazios');
  }

  // Verificar se é base64 válido
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(base64Data)) {
    throw new Error('Dados base64 contêm caracteres inválidos');
  }

  return base64Data;
}

// Compress imagem (copiado dos produtos, com logs)
async function compressImage(buffer) {
  try {
    // Verificar se o buffer tem conteúdo
    if (!buffer || buffer.length === 0) {
      throw new Error('Buffer de imagem vazio');
    }

    // Verificar se o buffer é uma imagem válida
    const metadata = await sharp(buffer).metadata();
    console.log('Metadata da imagem:', metadata);
    
    if (!metadata.format) {
      throw new Error('Formato de imagem não suportado');
    }
    
    // Redimensionar e comprimir a imagem
    return await sharp(buffer)
      .resize(800, 800, { 
        fit: 'inside',
        withoutEnlargement: true 
      })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (error) {
    console.error('Erro ao comprimir imagem:', error.message);
    console.error('Tamanho do buffer:', buffer ? buffer.length : 'undefined');
    throw new Error(`Erro ao processar imagem: ${error.message}`);
  }
}

// Upload pro S3 (ajustado pra usar compress + validate, igual produtos)
async function uploadToS3(base64Image, folder) {
  try {
    // Valida base64
    const base64Data = validateBase64Image(base64Image);
    console.log('Processando foto, tamanho base64:', base64Data.length);
    
    const buffer = Buffer.from(base64Data, 'base64');
    console.log('Buffer criado, tamanho:', buffer.length);
    
    const compressed = await compressImage(buffer);
    console.log('Imagem comprimida, tamanho:', compressed.length);
    
    const key = `${folder}/${uuidv4()}.jpg`;
    const result = await s3.upload({ 
      Bucket: process.env.AWS_BUCKET_NAME, 
      Key: key, 
      Body: compressed,
      ContentType: 'image/jpeg',
      ACL: 'public-read'
    }).promise();
    
    console.log(`Upload realizado com sucesso: ${result.Location}`);
    return result.Location;  // Só o LINK
  } catch (error) {
    console.error('Erro no upload para S3:', error.message);
    throw error;
  }
}

async function criarUsuario(dados) {
  const { usuario, fotoPerfilBase64 } = dados;

  const senhaHash = await bcrypt.hash(usuario.senha, 10);

  return sequelize.transaction(async (t) => {
    let foto_perfil = null;

    if (fotoPerfilBase64) {
      // Upload OBRIGATÓRIO com validate/compress - salva só link
      foto_perfil = await uploadToS3(fotoPerfilBase64, 'usuarios/perfil');
    }

    const usuarioCriado = await Usuario.create({
      ...usuario,
      senha: senhaHash,
      foto_perfil  // Só link ou null
    }, { transaction: t });

    return usuarioCriado;
  });
}

async function buscarUsuarioPorId(id) {
  const usuario = await Usuario.findByPk(id);
  return usuario;  // foto_perfil já é link do S3
}

async function buscarUsuarioPorEmail(email) {
  return await Usuario.findOne({ where: { email } });
}

async function atualizarUsuario(id, dados) {
  return await Usuario.update(dados, {
    where: { usuario_id: id },
    returning: true,
  });
}

async function deletarUsuario(id) {
  return await Usuario.destroy({ where: { usuario_id: id } });
}

async function atualizarPerfil(id, dadosPerfil) {
  const [updatedRows] = await Usuario.update(dadosPerfil, {
    where: { usuario_id: id },
    returning: true,
  });
  if (updatedRows > 0) {
    const usuario = await Usuario.findByPk(id);
    return usuario;
  }
  return null;
}

async function buscarUsuarioPorIdComSenha(id) {
  const usuario = await Usuario.findOne({
    where: { usuario_id: id },
    attributes: { include: ['senha'] }
  });
  return usuario;
}

async function atualizarFotoPerfil(usuarioId, imageBase64) {
  return sequelize.transaction(async (t) => {
    const usuario = await Usuario.findByPk(usuarioId, { transaction: t });
    if (!usuario) {
      throw new Error('Usuário não encontrado');
    }

    const oldFileUrl = usuario.foto_perfil;
    if (oldFileUrl && oldFileUrl.includes(process.env.AWS_BUCKET_NAME)) {
      await deleteFromS3(oldFileUrl);
    }

    // Upload OBRIGATÓRIO com validate/compress - salva só link
    const newFileUrl = await uploadToS3(imageBase64, 'usuarios/perfil');

    usuario.foto_perfil = newFileUrl;
    await usuario.save({ transaction: t });

    const usuarioAtualizado = usuario.toJSON();
    delete usuarioAtualizado.senha;
    return usuarioAtualizado;
  });
}

async function listarUsuarios(filtros = {}) {
  const usuarios = await Usuario.findAll({ where: filtros });
  return usuarios;  // foto_perfil já é link
}

/**
 * Busca todos os IDs de empresas filhas (incluindo recursivamente)
 * @param {number} empresaPaiId - ID da empresa pai
 * @param {Set<number>} visitados - IDs já visitados (para evitar loops infinitos)
 * @returns {Promise<number[]>} Array com IDs da empresa pai + todas as empresas filhas
 */
async function buscarIdsEmpresasFilhas(empresaPaiId, visitados = new Set()) {
  // Proteção contra loops infinitos
  if (visitados.has(empresaPaiId)) {
    return [];
  }
  visitados.add(empresaPaiId);
  
  // Incluir a própria empresa pai
  const idsEmpresas = [empresaPaiId];
  
  // Buscar empresas filhas diretas
  const empresasFilhas = await Usuario.findAll({
    where: {
      role: 'empresa',
      empresa_pai_id: empresaPaiId
    },
    attributes: ['usuario_id']
  });
  
  // Buscar empresas filhas recursivamente (empresas filhas de empresas filhas)
  for (const empresaFilha of empresasFilhas) {
    const empresasNetas = await buscarIdsEmpresasFilhas(empresaFilha.usuario_id, visitados);
    idsEmpresas.push(...empresasNetas);
  }
  
  // Remover duplicatas
  return [...new Set(idsEmpresas)];
}

/**
 * Busca clientes que têm pedidos com uma empresa (ou suas empresas filhas)
 * Regra: Se o cliente fez um pedido com a empresa, ele já pode ser listado como cliente daquela empresa
 * @param {number} empresaId - ID da empresa pai
 * @returns {Promise<Usuario[]>} Array com os clientes que têm pedidos com essa empresa
 */
async function buscarClientesPorPedidos(empresaId) {
  // Buscar IDs de todas as empresas (pai + filhas)
  const idsEmpresas = await buscarIdsEmpresasFilhas(empresaId);
  
  // Buscar pedidos com essas empresas e extrair os IDs únicos dos clientes usando DISTINCT
  const pedidos = await Pedido.findAll({
    where: {
      empresa_id: { [Op.in]: idsEmpresas }
    },
    attributes: [[sequelize.fn('DISTINCT', sequelize.col('cliente_id')), 'cliente_id']],
    raw: true
  });
  
  const idsClientes = pedidos.map(p => p.cliente_id).filter(id => id !== null);
  
  // Se não houver clientes, retornar array vazio
  if (idsClientes.length === 0) {
    return [];
  }
  
  // Buscar os clientes
  const clientes = await Usuario.findAll({
    where: {
      usuario_id: { [Op.in]: idsClientes },
      role: 'cliente'
    }
  });
  
  return clientes;
}

module.exports = {
  criarUsuario,
  buscarUsuarioPorId,
  buscarUsuarioPorEmail,
  atualizarUsuario,
  deletarUsuario,
  atualizarPerfil,
  buscarUsuarioPorIdComSenha,
  atualizarFotoPerfil,
  listarUsuarios,
  buscarIdsEmpresasFilhas,
  buscarClientesPorPedidos,
};