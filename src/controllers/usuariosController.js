const usuariosRepository = require("../repositories/usuariosRepository");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const authConfig = require("../config/auth.json");
const { Sequelize, Op } = require("sequelize");

function UsuarioController() {
  async function cadastrar(req, res) {
    try {
      console.log("📝 Iniciando cadastro de usuário...");
      console.log("📦 Body recebido:", {
        nome: req.body.nome,
        email: req.body.email,
        role: req.body.role,
        telefone: req.body.telefone,
        tem_foto: !!req.body.foto_perfil,
        tamanho_foto: req.body.foto_perfil ? req.body.foto_perfil.length : 0
      });

      const { nome, telefone, email, senha, role, foto_perfil, cliente_endereco, empresa_pai_id } = req.body;

      // Validações básicas
      if (!nome || !telefone || !email || !senha || !role) {
        console.log("❌ Validação falhou - campos obrigatórios ausentes");
        return res.status(400).json({ 
          error: "Nome, telefone, email, senha e role são obrigatórios" 
        });
      }

      // Validar role
      if (!["cliente", "empresa", "admin", "empresa-funcionario"].includes(role)) {
        return res.status(400).json({ 
          error: "Role inválido. Use 'cliente', 'empresa', 'admin' ou 'empresa-funcionario'." 
        });
      }

      // Verificar se o email já existe
      console.log("🔍 Verificando se email já existe...");
      const usuarioExistente = await usuariosRepository.buscarUsuarioPorEmail(email);
      if (usuarioExistente) {
        console.log("❌ Email já cadastrado");
        return res.status(400).json({ error: "Email já cadastrado" });
      }
      console.log("✅ Email disponível");

      // Validar formato do telefone (10 ou 11 dígitos)
      const telefoneLimpo = telefone.replace(/\D/g, '');
      if (!/^\d{10,11}$/.test(telefoneLimpo)) {
        return res.status(400).json({ 
          error: "Telefone inválido. Use apenas números (10 ou 11 dígitos)." 
        });
      }

      // Validar formato da foto (igual produtos) - se fornecida
      if (foto_perfil) {
        if (!foto_perfil.startsWith('data:image')) {
          return res.status(400).json({ 
            error: "Formato inválido para a foto de perfil (deve ser base64 'data:image/...')" 
          });
        }
        // Limite de tamanho (igual produtos)
        if (foto_perfil.length > 5000000) {  // ~5MB base64
          return res.status(400).json({ error: "Foto muito grande (máx 5MB)" });
        }
      }

      // Lógica de empresa_pai_id: se empresa logada cria funcionário/cliente/empresa filha, vincular automaticamente
      let empresaPaiIdFinal = empresa_pai_id || null;
      if (req.user && req.user.role === 'empresa') {
        // Se empresa está criando um funcionário, cliente ou outra empresa, vincular a ela
        if (role === 'empresa-funcionario' || role === 'cliente' || role === 'empresa') {
          empresaPaiIdFinal = req.user.usuario_id;
        }
      }

      // Criar usuário - repo valida/comprime/upload e salva link
      console.log("💾 Criando usuário no banco de dados...");
      const usuarioCriado = await usuariosRepository.criarUsuario({
        usuario: {
          nome,
          telefone: telefoneLimpo,
          email,
          senha,
          role,
          cliente_endereco: cliente_endereco || null,
          empresa_pai_id: empresaPaiIdFinal
        },
        fotoPerfilBase64: foto_perfil
      });

      console.log("✅ Usuário criado com sucesso:", usuarioCriado.usuario_id);

      const usuarioRetorno = usuarioCriado.toJSON();
      delete usuarioRetorno.senha;

      console.log("📤 Enviando resposta ao cliente...");
      res.status(201).json({
        message: "Usuário cadastrado com sucesso",
        usuario: usuarioRetorno  // foto_perfil: link S3
      });
    } catch (error) {
      console.error("❌ Erro no cadastro:", error);
      console.error("Stack trace:", error.stack);
      res.status(500).json({
        error: "Erro ao cadastrar usuário",
        details: error.message  // Ex: "Erro ao processar imagem" se base64 inválido
      });
    }
  }

  async function logar(req, res) {
    try {
      const { email, senha } = req.body;

      if (!email || !senha) {
        return res.status(400).json({ error: "Email e senha são obrigatórios" });
      }

      const usuario = await usuariosRepository.buscarUsuarioPorEmail(email);
      if (!usuario) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      const senhaValida = await bcrypt.compare(senha, usuario.senha);
      if (!senhaValida) {
        return res.status(401).json({ error: "Senha incorreta" });
      }

      const token = jwt.sign(
        {
          usuario_id: usuario.usuario_id,
          role: usuario.role,
          email: usuario.email
        },
        authConfig.secret,
        { expiresIn: "24h" }
      );

      const resposta = {
        usuario: {
          usuario_id: usuario.usuario_id,
          email: usuario.email,
          role: usuario.role,
          nome: usuario.nome,
          telefone: usuario.telefone,
          foto_perfil: usuario.foto_perfil,  // Já é link do S3
          empresa_pai_id: usuario.empresa_pai_id || null
        },
        token
      };

      res.json(resposta);
    } catch (error) {
      console.error("Erro no login:", error);
      res.status(500).json({ error: "Erro no login" });
    }
  }

  async function listar(req, res) {
    try {
      const { role: userRole } = req.user;
      let whereClause = {
        usuario_id: { [Op.ne]: req.user.usuario_id } // Excluir o próprio usuário
      };

      // Definir quais roles o usuário pode ver baseado no seu role
      switch (userRole) {
        case 'admin':
          // Admin vê todos os usuários (incluindo outros admins)
          console.log('🔑 Admin logado - mostrando todos os usuários');
          break;
          
        case 'empresa':
          // Empresa vê:
          // 1. Seus funcionários (empresa-funcionario com empresa_pai_id = empresa)
          // 2. Empresas filhas (empresa com empresa_pai_id = empresa)
          // 3. Clientes que têm pedidos com ela (baseado em pedidos, não empresa_pai_id)
          const funcionariosEEmpresasFilhas = [
            { role: 'empresa-funcionario', empresa_pai_id: req.user.usuario_id },
            { role: 'empresa', empresa_pai_id: req.user.usuario_id }
          ];
          
          // Buscar clientes que têm pedidos com essa empresa
          const clientesComPedidos = await usuariosRepository.buscarClientesPorPedidos(req.user.usuario_id);
          const idsClientesComPedidos = clientesComPedidos.map(c => c.usuario_id);
          
          if (idsClientesComPedidos.length > 0) {
            whereClause[Op.or] = [
              ...funcionariosEEmpresasFilhas,
              { role: 'cliente', usuario_id: { [Op.in]: idsClientesComPedidos } }
            ];
          } else {
            whereClause[Op.or] = funcionariosEEmpresasFilhas;
          }
          
          console.log('🏢 Empresa logada - mostrando funcionários, empresas filhas e clientes com pedidos');
          break;
          
        case 'empresa-funcionario':
          // Funcionário vê os mesmos dados da empresa pai:
          // 1. Funcionários da empresa pai
          // 2. Empresas filhas da empresa pai
          // 3. Clientes que têm pedidos com a empresa pai (baseado em pedidos, não empresa_pai_id)
          const funcionario = await usuariosRepository.buscarUsuarioPorId(req.user.usuario_id);
          if (funcionario && funcionario.empresa_pai_id) {
            const funcionariosEEmpresasFilhas = [
              { role: 'empresa-funcionario', empresa_pai_id: funcionario.empresa_pai_id },
              { role: 'empresa', empresa_pai_id: funcionario.empresa_pai_id }
            ];
            
            // Buscar clientes que têm pedidos com a empresa pai
            const clientesComPedidos = await usuariosRepository.buscarClientesPorPedidos(funcionario.empresa_pai_id);
            const idsClientesComPedidos = clientesComPedidos.map(c => c.usuario_id);
            
            if (idsClientesComPedidos.length > 0) {
              whereClause[Op.or] = [
                ...funcionariosEEmpresasFilhas,
                { role: 'cliente', usuario_id: { [Op.in]: idsClientesComPedidos } }
              ];
            } else {
              whereClause[Op.or] = funcionariosEEmpresasFilhas;
            }
            
            console.log('👔 Funcionário logado - mostrando funcionários, empresas filhas e clientes com pedidos da empresa pai');
          } else {
            // Se não tem empresa_pai_id, não mostra nada
            whereClause.usuario_id = { [Op.eq]: -1 }; // ID inexistente
          }
          break;
          
        case 'cliente':
          // Cliente vê apenas empresas (não vê admins nem outras empresas)
          whereClause.role = 'empresa';
          console.log('👤 Cliente logado - mostrando apenas empresas');
          break;
          
        default:
          return res.status(403).json({ error: 'Role não autorizado' });
      }

      const usuarios = await usuariosRepository.listarUsuarios(whereClause);

      // Se não encontrar usuários, retornar array vazio com mensagem explicativa
      if (usuarios.length === 0) {
        const roleMessage = userRole === 'admin' ? 'usuários' : 
                           userRole === 'empresa' ? 'empresas e clientes' : 'empresas';
        
        return res.json({
          message: `Nenhum ${roleMessage} encontrado.`,
          usuarios: []
        });
      }

      res.json(
        usuarios.map((u) => {
          const usuario = u.toJSON();
          delete usuario.senha;
          return {
            usuario_id: usuario.usuario_id,
            nome: usuario.nome,
            telefone: usuario.telefone,
            email: usuario.email,
            role: usuario.role,
            foto_perfil: usuario.foto_perfil,  // Link do S3
            cliente_endereco: usuario.cliente_endereco,
            empresa_pai_id: usuario.empresa_pai_id
          };
        })
      );
    } catch (error) {
      console.error("Erro ao listar usuários:", error);
      res.status(500).json({ error: "Erro ao listar usuários" });
    }
  }

  async function buscarPorId(req, res) {
    try {
      const { id } = req.params;
      const usuario = await usuariosRepository.buscarUsuarioPorId(id);

      if (!usuario) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      const usuarioRetorno = usuario.toJSON();
      delete usuarioRetorno.senha;

      res.json(usuarioRetorno);  // foto_perfil é link
    } catch (error) {
      console.error("Erro ao buscar usuário:", error);
      res.status(500).json({ error: "Erro ao buscar usuário" });
    }
  }

  async function atualizar(req, res) {
    try {
      const { id } = req.params;
      const dadosAtualizacao = req.body;

      // Não permitir atualização de campos críticos
      delete dadosAtualizacao.senha;
      delete dadosAtualizacao.usuario_id;
      delete dadosAtualizacao.role;
      delete dadosAtualizacao.foto_perfil; // Atualizar foto por endpoint separado

      // Campos permitidos: nome, telefone, email, cliente_endereco (e outros campos do model exceto os bloqueados acima)

      // Validar telefone se fornecido
      if (dadosAtualizacao.telefone) {
        const telefoneLimpo = dadosAtualizacao.telefone.replace(/\D/g, '');
        if (!/^\d{10,11}$/.test(telefoneLimpo)) {
          return res.status(400).json({ 
            error: "Telefone inválido. Use apenas números (10 ou 11 dígitos)." 
          });
        }
        dadosAtualizacao.telefone = telefoneLimpo;
      }

      const [updated] = await usuariosRepository.atualizarUsuario(id, dadosAtualizacao);

      if (!updated) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      const usuarioAtualizado = await usuariosRepository.buscarUsuarioPorId(id);
      const usuarioRetorno = usuarioAtualizado.toJSON();
      delete usuarioRetorno.senha;

      res.json({
        message: "Usuário atualizado com sucesso",
        usuario: usuarioRetorno
      });
    } catch (error) {
      console.error("Erro ao atualizar usuário:", error);
      res.status(500).json({ error: "Erro ao atualizar usuário" });
    }
  }

  async function atualizarPerfil(req, res) {
    try {
      const { id } = req.params;
      const dadosAtualizacao = req.body;
      const usuarioLogadoId = req.user.usuario_id;

      // Verificar se o usuário está atualizando seu próprio perfil
      if (parseInt(id, 10) !== usuarioLogadoId) {
        return res.status(403).json({ error: "Não autorizado a editar este perfil." });
      }

      // Não permitir atualização de campos críticos
      delete dadosAtualizacao.senha;
      delete dadosAtualizacao.role;
      delete dadosAtualizacao.usuario_id;
      delete dadosAtualizacao.foto_perfil; // Atualizar foto por endpoint separado

      // Validar telefone se fornecido
      if (dadosAtualizacao.telefone) {
        const telefoneLimpo = dadosAtualizacao.telefone.replace(/\D/g, '');
        if (!/^\d{10,11}$/.test(telefoneLimpo)) {
          return res.status(400).json({ 
            error: "Telefone inválido. Use apenas números (10 ou 11 dígitos)." 
          });
        }
        dadosAtualizacao.telefone = telefoneLimpo;
      }

      const usuarioAtualizado = await usuariosRepository.atualizarPerfil(id, dadosAtualizacao);

      if (!usuarioAtualizado) {
        return res.status(404).json({ 
          error: "Usuário não encontrado ou nenhuma alteração realizada." 
        });
      }

      const usuarioRetorno = usuarioAtualizado.toJSON();
      delete usuarioRetorno.senha;

      res.json({
        message: "Perfil atualizado com sucesso!",
        usuario: usuarioRetorno
      });

    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
      res.status(500).json({ error: "Erro interno ao atualizar perfil." });
    }
  }

  async function alterarSenha(req, res) {
    try {
      const { id } = req.params;
      const { senhaAtual, novaSenha } = req.body;
      const usuarioLogadoId = req.user.usuario_id;

      // Verificar autorização
      if (parseInt(id, 10) !== usuarioLogadoId) {
        return res.status(403).json({ error: "Não autorizado." });
      }

      if (!senhaAtual || !novaSenha) {
        return res.status(400).json({ 
          error: "Senha atual e nova senha são obrigatórias." 
        });
      }

      // Buscar usuário com senha
      const usuario = await usuariosRepository.buscarUsuarioPorIdComSenha(id);
      if (!usuario) {
        return res.status(404).json({ error: "Usuário não encontrado." });
      }

      // Validar senha atual
      const senhaValida = await bcrypt.compare(senhaAtual, usuario.senha);
      if (!senhaValida) {
        return res.status(401).json({ error: "Senha atual incorreta." });
      }

      // Atualizar senha
      const senhaHash = await bcrypt.hash(novaSenha, 10);
      await usuariosRepository.atualizarUsuario(id, { senha: senhaHash });

      res.status(200).json({ message: "Senha alterada com sucesso." });

    } catch (error) {
      console.error("Erro ao alterar senha:", error);
      res.status(500).json({ error: "Erro interno ao alterar senha." });
    }
  }

  async function atualizarFotoPerfil(req, res) {
    try {
      const { id } = req.params;
      const { foto_perfil } = req.body;
      const usuarioLogadoId = req.user.usuario_id;

      // Verificar autorização
      if (parseInt(id, 10) !== usuarioLogadoId) {
        return res.status(403).json({ error: "Não autorizado." });
      }

      if (!foto_perfil) {
        return res.status(400).json({ error: "Foto de perfil é obrigatória." });
      }

      if (!foto_perfil.startsWith('data:image')) {
        return res.status(400).json({ 
          error: "Formato inválido para a foto de perfil (deve ser base64 'data:image/...')" 
        });
      }

      // Limite de tamanho (igual produtos)
      if (foto_perfil.length > 5000000) {
        return res.status(400).json({ error: "Foto muito grande (máx 5MB)" });
      }

      const updatedUser = await usuariosRepository.atualizarFotoPerfil(id, foto_perfil);  // Repo processa e salva link

      res.status(200).json({
        message: "Foto de perfil atualizada com sucesso!",
        usuario: updatedUser  // foto_perfil: novo link S3
      });
    } catch (error) {
      console.error("Erro ao atualizar foto de perfil:", error);
      res.status(500).json({ error: "Erro interno ao atualizar foto de perfil." });
    }
  }

  async function deletar(req, res) {
    try {
      const { id } = req.params;
      const deletado = await usuariosRepository.deletarUsuario(id);

      if (!deletado) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      res.json({ message: "Usuário excluído com sucesso" });
    } catch (error) {
      console.error("Erro ao excluir usuário:", error);
      res.status(500).json({ error: "Erro ao excluir usuário" });
    }
  }

  return {
    cadastrar,
    logar,
    listar,
    buscarPorId,
    atualizar,
    atualizarPerfil,
    alterarSenha,
    atualizarFotoPerfil,
    deletar,
  };
}

module.exports = UsuarioController;