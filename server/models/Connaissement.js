const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/** Table métier `connaissements` (remplace l’usage de `bl_documents`). */
const Connaissement = sequelize.define(
  'Connaissement',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    blNumber: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
      field: 'bl_number'
    },
    carrier: { type: DataTypes.STRING(100), allowNull: false },
    shipperName: { type: DataTypes.STRING(255), allowNull: false, field: 'shipper_name' },
    shipperAddress: { type: DataTypes.TEXT, allowNull: false, field: 'shipper_address' },
    consigneeName: { type: DataTypes.STRING(255), allowNull: false, field: 'consignee_name' },
    consigneeAddress: { type: DataTypes.TEXT, allowNull: false, field: 'consignee_address' },
    vesselName: { type: DataTypes.STRING(100), allowNull: false, field: 'vessel_name' },
    voyageNumber: { type: DataTypes.STRING(50), allowNull: false, field: 'voyage_number' },
    portOfLoading: { type: DataTypes.STRING(100), allowNull: false, field: 'port_of_loading' },
    portOfDischarge: { type: DataTypes.STRING(100), allowNull: false, field: 'port_of_discharge' },
    placeOfDelivery: { type: DataTypes.STRING(100), allowNull: false, field: 'place_of_delivery' },
    goodsDescription: { type: DataTypes.TEXT, field: 'goods_description' },
    totalPackages: { type: DataTypes.STRING(50), field: 'total_packages' },
    totalWeightKg: { type: DataTypes.DECIMAL(12, 2), field: 'total_weight_kg' },
    eta: { type: DataTypes.DATE },
    totalMeasurementCbm: { type: DataTypes.DECIMAL(10, 2), field: 'total_measurement_cbm' },
    hsCodeIndicated: { type: DataTypes.STRING(20), field: 'hs_code_indicated' },
    clientNom: { type: DataTypes.STRING(255), field: 'client_nom' },
    zoneNom: { type: DataTypes.STRING(255), field: 'zone_nom' },
    zoneConnaissement: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'zone_connaissement',
      references: { model: 'zones', key: 'id' }
    },
    directionConnaissement: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'direction_connaissement',
      references: { model: 'tbl_directions_provinciales', key: 'id' }
    },
    bureauConnaissement: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'bureau_connaissement',
      references: { model: 'tbl_bureaux_internationaux', key: 'id' }
    },
    dateEmail: { type: DataTypes.DATE, field: 'date_email' },
    adresseMail: { type: DataTypes.STRING(255), field: 'adresse_mail' },
    numeroDossier: { type: DataTypes.STRING(255), field: 'numero_dossier' },
    numeroFxi: { type: DataTypes.STRING(255), field: 'numero_fxi' },
    dateEmission: { type: DataTypes.DATEONLY, field: 'date_emission' },
    validationFxi: { type: DataTypes.STRING(255), field: 'validation_fxi' },
    dateValidationFxi: { type: DataTypes.DATEONLY, field: 'date_validation_fxi' },
    controleParId: { type: DataTypes.INTEGER, field: 'controle_par_id' },
    controlePar: { type: DataTypes.STRING(255), field: 'controle_par' },
    dateControle: { type: DataTypes.DATE, field: 'date_controle' },
    declarationNumber: { type: DataTypes.STRING(128), field: 'declaration_number' },
    isExported: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_exported' },
    isDeclared: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_declared' },
    isValidated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_validated' },
    annotationControlleur: { type: DataTypes.TEXT, field: 'annotation_controlleur' },
    datetimeAnnotation: { type: DataTypes.DATE, field: 'datetime_annotation' },
    isControlledByController: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_controlled_by_controller'
    },
    numeroFeri: { type: DataTypes.STRING(255), field: 'numero_feri' }
  },
  {
    tableName: 'connaissements',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

module.exports = Connaissement;
