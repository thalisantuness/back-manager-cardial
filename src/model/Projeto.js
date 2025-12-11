const { Sequelize } = require("sequelize");
const sequelize = require("../utils/db");
const { Usuario } = require("./Usuarios");


const Projeto = sequelize.define(
  "Projeto",
  {
    projeto_id: {
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
    empresa_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: "usuarios",
        key: "usuario_id",
      },
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
    tableName: "projetos",
    timestamps: false,
  }
);

// Associação com Empresa (Usuario)
Projeto.belongsTo(Usuario, { foreignKey: "empresa_id", as: "Empresa" });

module.exports = { Projeto };


