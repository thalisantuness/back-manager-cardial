const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../utils/db');
const {Usuario} = require('./Usuarios');
const { Projeto } = require('./Projeto');

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



const ItemVenda = sequelize.define('ItemVenda', {
  item_venda_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  venda_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'venda',
      key: 'venda_id',
    },
  },
  projeto_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'projetos',
      key: 'projeto_id',
    },
  },
  quantidade: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  preco_unitario: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
}, {
  schema: 'public',
  tableName: 'item_venda',
  timestamps: false,
});

Venda.hasMany(ItemVenda, {
  foreignKey: 'venda_id',
  as: 'itens',
});

ItemVenda.belongsTo(Projeto, {
  foreignKey: 'projeto_id',
  as: 'projeto',
});

module.exports = { Venda, ItemVenda };