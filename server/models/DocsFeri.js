const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Pièces jointes FERI liées à un connaissement (`tbl_docs_feri`).
 */
const DocsFeri = sequelize.define(
  'DocsFeri',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    docConnaissementId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      field: 'doc_connaissement_id'
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
    tableName: 'tbl_docs_feri',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

module.exports = DocsFeri;
