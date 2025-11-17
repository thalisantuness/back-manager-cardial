const { Sequelize } = require("sequelize");
const sequelize = require("../utils/db");
const { Conversa } = require("./Conversa");
const { Usuario } = require("./Usuarios");

const Mensagem = sequelize.define(
  "Mensagem",
  {
    mensagem_id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    conversa_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: "conversas",
        key: "conversa_id",
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE', // Adiciona exclusão em cascata
    },
    remetente_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: "usuarios",
        key: "usuario_id",
      },
    },
    conteudo: {
      type: Sequelize.TEXT,
      allowNull: false,
    },
    data_envio: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
    lida: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    schema: "public",
    tableName: "mensagens",
    timestamps: false,
  }
);

Mensagem.belongsTo(Conversa, { foreignKey: "conversa_id" });
Mensagem.belongsTo(Usuario, { foreignKey: "remetente_id", as: "Remetente" });

module.exports = { Mensagem };