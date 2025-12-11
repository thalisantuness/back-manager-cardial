const jwt = require('jsonwebtoken');
const authConfig = require('../config/auth.json');

// Middleware de autenticação OPCIONAL
// - Se não houver token: segue sem autenticar (req.user fica undefined)
// - Se houver token válido: popula req.user com { usuario_id, role }
// - Se houver token inválido/malformatado: retorna 401
module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Sem header de autorização -> requisição pública
  if (!authHeader) {
    return next();
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2) {
    return res.status(401).send({ error: 'Token error' });
  }

  const [scheme, token] = parts;

  if (!/^Bearer$/i.test(scheme)) {
    return res.status(401).send({ error: 'Token malformatted' });
  }

  jwt.verify(token, authConfig.secret, (err, decoded) => {
    if (err) return res.status(401).send({ error: 'Token invalid' });

    req.user = {
      usuario_id: decoded.usuario_id,
      role: decoded.role,
    };

    return next();
  });
};


