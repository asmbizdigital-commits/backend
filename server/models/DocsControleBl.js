const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/** Pièces jointes du contrôle Sygrem liées à un connaissement (`tbl_docs_controle_bl`). */
const DocsControleBl = sequelize.define(
  'DocsControleBl',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    connaissementId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'connaissement_id'
    },
    fileUrl: {
      type: DataTypes.STRING(1000),
      allowNull: false,
      field: 'file_url'
    },
    cloudinaryPublicId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'cloudinary_public_id'
    },
    originalFilename: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'original_filename'
    },
    mimeType: {
      type: DataTypes.STRING(120),
      allowNull: true,
      field: 'mime_type'
    },
    uploadedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'uploaded_by'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'updated_at'
    }
  },
  {
    tableName: 'tbl_docs_controle_bl',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

module.exports = DocsControleBl;
