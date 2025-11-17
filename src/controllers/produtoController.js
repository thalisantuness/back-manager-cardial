const produtoRepo = require('../repositories/produtoRepository');
const sharp = require('sharp');
const s3 = require('../utils/awsConfig');
const { v4: uuidv4 } = require('uuid');

function ProdutoController() {
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
      const filtros = req.query || {};
      const produtos = await produtoRepo.listarProdutos(filtros);
      res.json(produtos);
    } catch (e) {
      console.error('Erro ao listar produtos:', e);
      res.status(500).json({ error: 'Erro ao listar produtos' });
    }
  }

  async function buscarPorId(req, res) {
    try {
      const { id } = req.params;
      const produto = await produtoRepo.buscarProdutoPorId(id);
      if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });
      res.json(produto);
    } catch (e) {
      console.error('Erro ao buscar produto:', e);
      res.status(500).json({ error: 'Erro ao buscar produto' });
    }
  }

  async function criar(req, res) {
    try {
      const { nome, valor, tipo_comercializacao, tipo_produto, estado_id, foto_principal, fotos_secundarias, valor_custo, quantidade, menu, empresas_autorizadas } = req.body;

      // Validar autenticação
      if (!req.user) {
        return res.status(401).json({ error: 'Autenticação necessária para criar produto' });
      }

      if (!nome || !valor || !valor_custo || !quantidade) {
        return res.status(400).json({ error: 'nome, valor, valor_custo e quantidade são obrigatórios' });
      }

      // Validar valores permitidos para o campo menu
      const valoresMenuPermitidos = ['ecommerce', 'varejo', 'ambos'];
      if (menu && !valoresMenuPermitidos.includes(menu)) {
        return res.status(400).json({ 
          error: 'Valor inválido para o campo menu',
          valoresPermitidos: valoresMenuPermitidos
        });
      }

      // Lógica de empresas_autorizadas baseada no role do usuário
      let empresasAutorizadasFinal;
      
      if (req.user.role === 'empresa') {
        // Se for empresa, só pode cadastrar para si mesmo
        empresasAutorizadasFinal = [req.user.usuario_id];
      } else if (req.user.role === 'admin') {
        // Se for admin, pode selecionar empresas ou cadastrar para si mesmo
        if (empresas_autorizadas && Array.isArray(empresas_autorizadas) && empresas_autorizadas.length > 0) {
          empresasAutorizadasFinal = empresas_autorizadas;
        } else {
          empresasAutorizadasFinal = [req.user.usuario_id];
        }
      } else {
        // Outros roles: cadastra para o próprio usuário
        empresasAutorizadasFinal = [req.user.usuario_id];
      }

      const dados = { 
        nome, 
        valor, 
        tipo_comercializacao, 
        tipo_produto, 
        estado_id, 
        valor_custo, 
        quantidade,
        menu: menu || null,
        empresas_autorizadas: empresasAutorizadasFinal
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
          
          dados.foto_principal = await uploadToS3(compressed, 'produtos/principal');
          console.log('Foto principal salva no S3:', dados.foto_principal);
        } catch (error) {
          console.error('Erro ao fazer upload da foto principal para S3:', error.message);
          return res.status(400).json({ 
            error: `Erro ao processar foto principal: ${error.message}`,
            details: 'Verifique se a imagem está em formato válido (JPEG, PNG, etc.) e se o base64 está completo'
          });
        }
      }

      const produto = await produtoRepo.criarProduto(dados);

      if (Array.isArray(fotos_secundarias)) {
        for (const base64 of fotos_secundarias) {
          if (base64 && base64.startsWith('data:image')) {
            try {
              const base64Data = validateBase64Image(base64);
              const buf = Buffer.from(base64Data, 'base64');
              const comp = await compressImage(buf);
              const url = await uploadToS3(comp, 'produtos/secundarias');
              await produtoRepo.adicionarFoto(produto.produto_id, url);
              console.log('Foto secundária salva no S3:', url);
            } catch (error) {
              console.error('Erro ao fazer upload da foto secundária para S3:', error.message);
              // Continuar com as outras fotos mesmo se uma falhar
            }
          }
        }
      }

      res.status(201).json(produto);
    } catch (e) {
      console.error('Erro ao criar produto:', e);
      res.status(500).json({ error: 'Erro ao criar produto' });
    }
  }

  async function atualizar(req, res) {
    try {
      const { id } = req.params;
      const dados = req.body;

      // Validar valores permitidos para o campo menu (se fornecido)
      if (dados.menu) {
        const valoresMenuPermitidos = ['ecommerce', 'varejo', 'ambos'];
        if (!valoresMenuPermitidos.includes(dados.menu)) {
          return res.status(400).json({ 
            error: 'Valor inválido para o campo menu',
            valoresPermitidos: valoresMenuPermitidos
          });
        }
      }

      // Lógica de empresas_autorizadas na atualização
      if (dados.empresas_autorizadas !== undefined) {
        // Validar autenticação
        if (!req.user) {
          return res.status(401).json({ error: 'Autenticação necessária' });
        }
        
        if (req.user.role === 'empresa') {
          // Empresa não pode alterar empresas_autorizadas
          return res.status(403).json({ 
            error: 'Usuários do tipo empresa não podem alterar o campo empresas_autorizadas' 
          });
        } else if (req.user.role === 'admin') {
          // Admin pode alterar livremente
          if (!Array.isArray(dados.empresas_autorizadas)) {
            return res.status(400).json({ 
              error: 'empresas_autorizadas deve ser um array de IDs' 
            });
          }
        }
      }

      const produto = await produtoRepo.atualizarProduto(id, dados);
      res.json(produto);
    } catch (e) {
      console.error('Erro ao atualizar produto:', e);
      res.status(500).json({ error: e.message || 'Erro ao atualizar produto' });
    }
  }

  async function deletar(req, res) {
    try {
      const { id } = req.params;
      const resultado = await produtoRepo.deletarProduto(id);
      res.json(resultado);
    } catch (e) {
      console.error('Erro ao deletar produto:', e);
      res.status(500).json({ error: 'Erro ao deletar produto' });
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
        const url = await uploadToS3(comp, 'produtos/secundarias');
        
        const foto = await produtoRepo.adicionarFoto(id, url);
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

  return { listar, buscarPorId, criar, atualizar, deletar, adicionarFoto };
}

module.exports = ProdutoController;