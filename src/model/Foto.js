const { Sequelize } = require("sequelize");
const sequelize = require("../utils/db");
const { Projeto } = require("./Projeto");

const Foto = sequelize.define(
  "Foto",
  {
    photo_id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    projeto_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: Projeto,
        key: "projeto_id",
      },
    },
    imageData: {
      type: Sequelize.STRING,
      allowNull: false,
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
    tableName: "projeto_foto",
    timestamps: false,
  }
);

Foto.belongsTo(Projeto, { foreignKey: "projeto_id", as: "projeto" });
Projeto.hasMany(Foto, { foreignKey: "projeto_id", as: "fotos" });

module.exports = { Foto };


