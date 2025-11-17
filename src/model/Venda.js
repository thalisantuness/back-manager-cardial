const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../utils/db');
const {Usuario} = require('./Usuarios');
const { Produto } = require('./Produto');

const Venda = sequelize.define('Venda', {
  venda_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  usuario_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'usuarios', 
      key: 'usuario_id',
    },
  },
  data_venda: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW,
  },
  total: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'finalizada',
  },
}, {
  schema: 'public',
  tableName: 'venda',
  timestamps: false,
});



// Relacionamentos
Venda.belongsTo(Usuario, {
  foreignKey: 'usuario_id',
  as: 'usuario',
});



ItemVenda.belongsTo(Produto, {
  foreignKey: 'produto_id',
  as: 'produto',
});

module.exports = { Venda };