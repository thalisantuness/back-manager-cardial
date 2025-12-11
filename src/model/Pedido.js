const { Sequelize } = require("sequelize");
const sequelize = require("../utils/db");
const { Projeto } = require("./Projeto");
const { Usuario } = require("./Usuarios");  // Para associação com Cliente

const Pedido = sequelize.define(
  "Pedido",
  {
    pedido_id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    projeto_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: "projetos", key: "projeto_id" },
    },
    quantidade: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    cliente_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: "usuarios", key: "usuario_id" },
    },
    empresa_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: "usuarios", key: "usuario_id" },
    },
    data_hora_entrega: {
      type: Sequelize.DATE,
      allowNull: true,  // Opcional - cliente pode comprar sem definir data de entrega
    },
    status: {
      type: Sequelize.ENUM("pendente", "confirmado", "em_transporte", "entregue", "cancelado"),
      allowNull: false,
      defaultValue: "pendente",
    },
    observacao: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    data_cadastro: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
    data_update: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
  },
  {
    schema: "public",
    tableName: "pedidos",
    timestamps: false,
  }
);

// Associações
Pedido.belongsTo(Projeto, { foreignKey: "projeto_id", as: "Projeto" });
Pedido.belongsTo(Usuario, { foreignKey: "cliente_id", as: "Cliente" });
Pedido.belongsTo(Usuario, { foreignKey: "empresa_id", as: "Empresa" });

module.exports = { Pedido };