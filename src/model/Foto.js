const { Sequelize } = require("sequelize");
const sequelize = require("../utils/db");
const { Produto } = require("./Produto");

const Foto = sequelize.define(
  "Foto",
  {
    photo_id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    produto_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: Produto,
        key: "produto_id",
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
    tableName: "produto_foto",
    timestamps: false,
  }
);

Foto.belongsTo(Produto, { foreignKey: "produto_id", as: "produto" });
Produto.hasMany(Foto, { foreignKey: "produto_id", as: "fotos" });

module.exports = { Foto };


