const projetoRepo = require('../repositories/projetoRepository');
const sharp = require('sharp');
const s3 = require('../utils/awsConfig');
const { v4: uuidv4 } = require('uuid');

function ProjetoController() {
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

  async function uploadToS3(buffer, folder) {
    try {
      const key = `${folder}/${uuidv4()}.jpg`;
      const result = await s3.upload({ 
        Bucket: process.env.AWS_BUCKET_NAME, 
        Key: key, 
        Body: buffer, 
        ContentType: 'image/jpeg',
        ACL: 'public-read'
      }).promise();
      
      console.log(`Upload realizado com sucesso: ${result.Location}`);
      return result.Location;
    } catch (error) {
      console.error('Erro no upload para S3:', error.message);
      throw error;
    }
  }

  async function listar(req, res) {
    try {
      const { Op } = require('sequelize');
      const usuariosRepo = require('../repositories/usuariosRepository');
      const filtros = req.query || {};
      
      // Lógica de filtragem baseada no role
      if (req.user) {
        console.log('🔍 [GET /projetos] Usuário autenticado:', {
          usuario_id: req.user.usuario_id,
          role: req.user.role
        });

        // Buscar dados completos do usuário para verificar empresa_pai_id
        const usuarioCompleto = await usuariosRepo.buscarUsuarioPorId(req.user.usuario_id);
        console.log('👤 [GET /projetos] Dados completos do usuário:', {
          usuario_id: usuarioCompleto?.usuario_id,
          role: usuarioCompleto?.role,
          empresa_pai_id: usuarioCompleto?.empresa_pai_id,
          nome: usuarioCompleto?.nome
        });

        // Se o usuário tem empresa_pai_id, ele é um funcionário (mesmo que role seja "empresa")
        if (usuarioCompleto && usuarioCompleto.empresa_pai_id) {
          // Funcionário vê projetos da empresa pai + projetos de todas as empresas filhas
          const idsEmpresas = await usuariosRepo.buscarIdsEmpresasFilhas(usuarioCompleto.empresa_pai_id);
          console.log('👔 [GET /projetos] Funcionário - IDs de empresas (pai + filhas):', idsEmpresas);
          filtros.empresa_id = { [Op.in]: idsEmpresas };
        } else if (req.user.role === 'empresa') {
          // Empresa (sem empresa_pai_id) vê seus projetos + projetos de todas as empresas filhas (recursivamente)
          const idsEmpresas = await usuariosRepo.buscarIdsEmpresasFilhas(req.user.usuario_id);
          console.log('🏢 [GET /projetos] Empresa - IDs de empresas (pai + filhas):', idsEmpresas);
          filtros.empresa_id = { [Op.in]: idsEmpresas };
        } else if (req.user.role === 'empresa-funcionario') {
          // Funcionário sem empresa_pai_id (dados inconsistentes) - retornar vazio
          console.warn('⚠️ [GET /projetos] Funcionário sem empresa_pai_id - retornando array vazio');
          return res.json([]);
        }
        // Admin e cliente veem todos os projetos (marketplace) - não filtra por empresa_id
      } else {
        console.log('🌐 [GET /projetos] Requisição pública (sem autenticação) - retornando todos os projetos');
      }
      
      console.log('📦 [GET /projetos] Filtros aplicados:', JSON.stringify(filtros, null, 2));
      const projetos = await projetoRepo.listarProjetos(filtros);
      console.log(`✅ [GET /projetos] Retornando ${projetos.length} projeto(s)`);
      res.json(projetos);
    } catch (e) {
      console.error('❌ [GET /projetos] Erro ao listar projetos:', e);
      res.status(500).json({ error: 'Erro ao listar projetos' });
    }
  }

  async function buscarPorId(req, res) {
    try {
      const { id } = req.params;
      const projeto = await projetoRepo.buscarProjetoPorId(id);
      if (!projeto) return res.status(404).json({ error: 'Projeto não encontrado' });
      res.json(projeto);
    } catch (e) {
      console.error('Erro ao buscar projeto:', e);
      res.status(500).json({ error: 'Erro ao buscar projeto' });
    }
  }

  async function criar(req, res) {
    try {
      const { nome, valor, tipo_comercializacao, tipo_produto, estado_id, foto_principal, fotos_secundarias, valor_custo, quantidade, empresa_id } = req.body;

      // Validar autenticação
      if (!req.user) {
        return res.status(401).json({ error: 'Autenticação necessária para criar projeto' });
      }

      if (!nome || !valor || !valor_custo || !quantidade) {
        return res.status(400).json({ error: 'nome, valor, valor_custo e quantidade são obrigatórios' });
      }

      // Determinar empresa_id baseado no role
      let empresaIdFinal = empresa_id;
      if (req.user.role === 'empresa') {
        // Empresa cria projeto para si mesma
        empresaIdFinal = req.user.usuario_id;
      } else if (req.user.role === 'empresa-funcionario') {
        // Funcionário cria projeto para a empresa pai
        const funcionario = await require('../repositories/usuariosRepository').buscarUsuarioPorId(req.user.usuario_id);
        if (!funcionario || !funcionario.empresa_pai_id) {
          return res.status(403).json({ error: 'Funcionário não vinculado a uma empresa' });
        }
        empresaIdFinal = funcionario.empresa_pai_id;
      } else if (req.user.role === 'admin') {
        // Admin pode especificar empresa_id ou usar seu próprio ID
        empresaIdFinal = empresa_id || req.user.usuario_id;
      } else {
        return res.status(403).json({ error: 'Apenas empresas, funcionários e admins podem criar projetos' });
      }

      if (!empresaIdFinal) {
        return res.status(400).json({ error: 'empresa_id é obrigatório' });
      }

      const dados = { 
        nome, 
        valor, 
        tipo_comercializacao, 
        tipo_produto, 
        estado_id, 
        valor_custo, 
        quantidade,
        empresa_id: empresaIdFinal
      };

      if (foto_principal && foto_principal.startsWith('data:image')) {
        try {
          // Validar base64
          const base64Data = validateBase64Image(foto_principal);
          console.log('Processando foto principal, tamanho base64:', base64Data.length);
          
          const buffer = Buffer.from(base64Data, 'base64');
          console.log('Buffer criado, tamanho:', buffer.length);
          
          const compressed = await compressImage(buffer);
          console.log('Imagem comprimida, tamanho:', compressed.length);
          
          dados.foto_principal = await uploadToS3(compressed, 'projetos/principal');
          console.log('Foto principal salva no S3:', dados.foto_principal);
        } catch (error) {
          console.error('Erro ao fazer upload da foto principal para S3:', error.message);
          return res.status(400).json({ 
            error: `Erro ao processar foto principal: ${error.message}`,
            details: 'Verifique se a imagem está em formato válido (JPEG, PNG, etc.) e se o base64 está completo'
          });
        }
      }

      const projeto = await projetoRepo.criarProjeto(dados);

      if (Array.isArray(fotos_secundarias)) {
        for (const base64 of fotos_secundarias) {
          if (base64 && base64.startsWith('data:image')) {
            try {
              const base64Data = validateBase64Image(base64);
              const buf = Buffer.from(base64Data, 'base64');
              const comp = await compressImage(buf);
              const url = await uploadToS3(comp, 'projetos/secundarias');
              await projetoRepo.adicionarFoto(projeto.projeto_id, url);
              console.log('Foto secundária salva no S3:', url);
            } catch (error) {
              console.error('Erro ao fazer upload da foto secundária para S3:', error.message);
              // Continuar com as outras fotos mesmo se uma falhar
            }
          }
        }
      }

      res.status(201).json(projeto);
    } catch (e) {
      console.error('Erro ao criar projeto:', e);
      res.status(500).json({ error: 'Erro ao criar projeto' });
    }
  }

  async function atualizar(req, res) {
    try {
      const { id } = req.params;
      const dados = { ...req.body };

      // Processar foto_principal se for base64 (converter para S3)
      if (dados.foto_principal && dados.foto_principal.startsWith('data:image')) {
        try {
          // Validar base64
          const base64Data = validateBase64Image(dados.foto_principal);
          console.log('Processando foto principal no update, tamanho base64:', base64Data.length);
          
          const buffer = Buffer.from(base64Data, 'base64');
          console.log('Buffer criado, tamanho:', buffer.length);
          
          const compressed = await compressImage(buffer);
          console.log('Imagem comprimida, tamanho:', compressed.length);
          
          dados.foto_principal = await uploadToS3(compressed, 'projetos/principal');
          console.log('Foto principal salva no S3:', dados.foto_principal);
        } catch (error) {
          console.error('Erro ao fazer upload da foto principal para S3:', error.message);
          return res.status(400).json({ 
            error: `Erro ao processar foto principal: ${error.message}`,
            details: 'Verifique se a imagem está em formato válido (JPEG, PNG, etc.) e se o base64 está completo'
          });
        }
      } else if (dados.foto_principal === '' || dados.foto_principal === null) {
        // Se enviar string vazia ou null, não atualizar (manter atual)
        delete dados.foto_principal;
      } else if (dados.foto_principal && !dados.foto_principal.startsWith('http')) {
        // Se não for base64 nem URL válida, pode ser um erro
        return res.status(400).json({ 
          error: 'foto_principal deve ser uma URL do S3 ou base64 (data:image/...)'
        });
      }

      // Remover menu dos dados (não é mais usado)
      delete dados.menu;

      // Lógica de empresas_autorizadas na atualização desativada temporariamente
      // if (dados.empresas_autorizadas !== undefined) {
      //   if (!req.user) {
      //     return res.status(401).json({ error: 'Autenticação necessária' });
      //   }
      //   if (req.user.role === 'empresa') {
      //     return res.status(403).json({ 
      //       error: 'Usuários do tipo empresa não podem alterar o campo empresas_autorizadas' 
      //     });
      //   } else if (req.user.role === 'admin') {
      //     if (!Array.isArray(dados.empresas_autorizadas)) {
      //       return res.status(400).json({ 
      //         error: 'empresas_autorizadas deve ser um array de IDs' 
      //       });
      //     }
      //   }
      // }

      const projeto = await projetoRepo.atualizarProjeto(id, dados);
      res.json(projeto);
    } catch (e) {
      console.error('Erro ao atualizar projeto:', e);
      res.status(500).json({ error: e.message || 'Erro ao atualizar projeto' });
    }
  }

  async function deletar(req, res) {
    try {
      const { id } = req.params;
      const resultado = await projetoRepo.deletarProjeto(id);
      res.json(resultado);
    } catch (e) {
      console.error('Erro ao deletar projeto:', e);
      res.status(500).json({ error: 'Erro ao deletar projeto' });
    }
  }

  async function adicionarFoto(req, res) {
    try {
      const { id } = req.params;
      const { imageBase64 } = req.body;
      if (!imageBase64 || !imageBase64.startsWith('data:image')) {
        return res.status(400).json({ error: 'Imagem inválida' });
      }
      
      try {
        const base64Data = validateBase64Image(imageBase64);
        const buf = Buffer.from(base64Data, 'base64');
        const comp = await compressImage(buf);
        const url = await uploadToS3(comp, 'projetos/secundarias');
        
        const foto = await projetoRepo.adicionarFoto(id, url);
        res.status(201).json(foto);
      } catch (error) {
        console.error('Erro ao fazer upload da foto para S3:', error.message);
        res.status(400).json({ 
          error: `Erro ao processar imagem: ${error.message}`,
          details: 'Verifique se a imagem está em formato válido e se o base64 está completo'
        });
      }
    } catch (e) {
      console.error('Erro ao adicionar foto:', e);
      res.status(500).json({ error: 'Erro ao adicionar foto' });
    }
  }

  async function deletarFoto(req, res) {
    try {
      const { id, fotoId } = req.params;
      const resultado = await projetoRepo.deletarFoto(id, fotoId);
      res.json(resultado);
    } catch (e) {
      console.error('Erro ao deletar foto:', e);
      res.status(400).json({ error: e.message || 'Erro ao deletar foto' });
    }
  }

  return { listar, buscarPorId, criar, atualizar, deletar, adicionarFoto, deletarFoto };
}

module.exports = ProjetoController;

