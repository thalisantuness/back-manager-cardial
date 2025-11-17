const { Sequelize } = require("sequelize");
const sequelize = require("../utils/db");


const Produto = sequelize.define(
  "Produto",
  {
    produto_id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    nome: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    valor: {
      type: Sequelize.FLOAT,
      allowNull: false,
    },
     valor_custo: {
      type: Sequelize.FLOAT,
      allowNull: false,
    },
     quantidade: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
    tipo_comercializacao: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    tipo_produto: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    menu: {
      type: Sequelize.STRING,
      allowNull: true,
    },
    empresas_autorizadas: {
      type: Sequelize.ARRAY(Sequelize.INTEGER),
      allowNull: true,
      defaultValue: [],
    },
    // estado_id: {
    //   type: Sequelize.INTEGER,
    //   allowNull: true,
    //   references: {
    //     model: Estado,
    //     key: "estado_id",
    //   },
    // },
    foto_principal: {
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
    tableName: "produtos",
    timestamps: false,
  }
);

// Produto.belongsTo(Estado, {
//   foreignKey: "estado_id",
//   as: "estado",
// });

module.exports = { Produto };


