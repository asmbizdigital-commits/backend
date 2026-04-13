const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Documents B/L extraits (table bl_documents).
 */
const BlDocument = sequelize.define(
  'BlDocument',
  {
    id: { type: DataTypes.STRING(36), primaryKey: true },
    fileName: { type: DataTypes.STRING(512), allowNull: false, field: 'file_name' },
    fileHash: { type: DataTypes.STRING(64), allowNull: false, field: 'file_hash' },
    blNumber: { type: DataTypes.STRING(64), field: 'bl_number' },
    bookingNumber: { type: DataTypes.STRING(64), field: 'booking_number' },
    vessel: { type: DataTypes.STRING(255) },
    portLoading: { type: DataTypes.STRING(255), field: 'port_loading' },
    portDischarge: { type: DataTypes.STRING(255), field: 'port_discharge' },
    weight: { type: DataTypes.STRING(64) },
    rawText: { type: DataTypes.TEXT('long'), field: 'raw_text' },
    status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'pending' },
    createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
    shipper: { type: DataTypes.TEXT },
    consignee: { type: DataTypes.TEXT },
    numeroDossier: { type: DataTypes.STRING(64), field: 'numero_dossier' },
    dateEmission: { type: DataTypes.DATEONLY, field: 'date_emission' },
    numeroFxi: { type: DataTypes.STRING(255), field: 'numero_fxi' },
    validationFxi: { type: DataTypes.STRING(255), field: 'validation_fxi' },
    dateValidationFxi: { type: DataTypes.DATEONLY, field: 'date_validation_fxi' },
    valeurFob: { type: DataTypes.STRING(64), field: 'valeur_fob' },
    fretBase: { type: DataTypes.STRING(64), field: 'fret_base' },
    fraisAdd: { type: DataTypes.STRING(64), field: 'frais_add' },
    assurance: { type: DataTypes.STRING(64) },
    totalCif: { type: DataTypes.STRING(64), field: 'total_cif' },
    importateur: { type: DataTypes.TEXT },
    exportateur: { type: DataTypes.TEXT },
    transitaire: { type: DataTypes.STRING(255) },
    armateur: { type: DataTypes.STRING(255) },
    typeTransport: { type: DataTypes.STRING(64), field: 'type_transport' },
    numeroVoyage: { type: DataTypes.STRING(64), field: 'numero_voyage' },
    conteneur: { type: DataTypes.STRING(128) },
    numeroConteneur: { type: DataTypes.STRING(128), field: 'numero_conteneur' },
    destinationRdc: { type: DataTypes.STRING(255), field: 'destination_rdc' },
    eta: { type: DataTypes.DATE },
    marchandise: { type: DataTypes.TEXT },
    paysProvenance: { type: DataTypes.STRING(128), field: 'pays_provenance' },
    codeHs: { type: DataTypes.STRING(64), field: 'code_hs' },
    origine: { type: DataTypes.STRING(255) },
    poidsNet: { type: DataTypes.STRING(64), field: 'poids_net' },
    poidsBrut: { type: DataTypes.STRING(64), field: 'poids_brut' },
    volumeCbm: { type: DataTypes.STRING(64), field: 'volume_cbm' },
    teu: { type: DataTypes.STRING(64) },
    controleParId: { type: DataTypes.INTEGER, field: 'controle_par_id' },
    controlePar: { type: DataTypes.STRING(255), field: 'controle_par' },
    dateControle: { type: DataTypes.DATE, field: 'date_controle' },
    declarationNumber: { type: DataTypes.STRING(128), field: 'declaration_number' },
    isExported: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_exported' },
    isDeclared: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_declared' },
    isValidated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_validated' },
    annotationControlleur: { type: DataTypes.TEXT, allowNull: true, field: 'annotation_controlleur' },
    datetimeAnnotation: { type: DataTypes.DATE, allowNull: true, field: 'datetime_annotation' },
    isControlledByController: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_controlled_by_controller'
    }
  },
  {
    tableName: 'bl_documents',
    timestamps: false,
    underscored: false
  }
);

module.exports = BlDocument;
