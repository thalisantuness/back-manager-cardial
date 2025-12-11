const { Sequelize } = require("sequelize");
const sequelize = require("../utils/db");

const Usuario = sequelize.define(
  "Usuario",
  {
    usuario_id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    role: {
      type: Sequelize.STRING, 
      allowNull: false,
    },
    nome: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    telefone: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    email: {
      type: Sequelize.STRING,
      allowNull: false,
      unique: true,
    },
    senha: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    foto_perfil: {
      type: Sequelize.TEXT,  // Igual produtos: TEXT ilimitado pra links S3
      allowNull: true,
    },
    cliente_endereco: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    empresa_pai_id: {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: "usuarios",
        key: "usuario_id",
      },
    },
    data_cadastro: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
    data_atualizacao: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
  },
  {
    schema: "public",
    tableName: "usuarios",
    timestamps: false,
  }
);

module.exports = { Usuario };