const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ETAPES = {
  1: 'Soumission besoin (fonds)',
  2: 'Demande de fonds créée',
  3: 'Décaissement en attente',
  4: 'Décaissement approuvé par auditeur',
  5: 'Paiement validé par le patron',
  6: 'Validation paiement par le Patron',
  7: 'Bon de sortie de caisse généré'
};

const CircuitDepense = sequelize.define('CircuitDepense', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  circuit_ref: {
    type: DataTypes.STRING(64),
    allowNull: false,
    comment: 'Référence du circuit (ex: SB-123)'
  },
  etape: {
    type: DataTypes.TINYINT,
    allowNull: false,
    comment: 'Numéro étape 1 à 7'
  },
  libelle_etape: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  soumission_besoins_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_soumissions_besoins', key: 'id' }
  },
  demande_fonds_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_demandes_fonds', key: 'id' }
  },
  depense_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_depenses', key: 'id' }
  },
  date_etape: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'tbl_utilisateurs', key: 'id' }
  },
  commentaire: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'tbl_circuits_depenses',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

CircuitDepense.ETAPES = ETAPES;

/** Créer l'étape 1 : soumission besoin type fonds */
CircuitDepense.creerEtape1 = async function (soumissionBesoinsId, createdBy) {
  const circuitRef = 'SB-' + soumissionBesoinsId;
  return this.create({
    circuit_ref: circuitRef,
    etape: 1,
    libelle_etape: ETAPES[1],
    soumission_besoins_id: soumissionBesoinsId,
    date_etape: new Date(),
    created_by: createdBy || null
  });
};

/** Créer l'étape 2 : demande de fonds créée (soumission traitée) */
CircuitDepense.creerEtape2 = async function (circuitRef, demandeFondsId, createdBy) {
  return this.create({
    circuit_ref: circuitRef,
    etape: 2,
    libelle_etape: ETAPES[2],
    demande_fonds_id: demandeFondsId,
    date_etape: new Date(),
    created_by: createdBy || null
  });
};

/** Créer l'étape 3 : décaissement en attente (demande approuvée -> dépense créée) */
CircuitDepense.creerEtape3 = async function (circuitRef, depenseId, createdBy) {
  return this.create({
    circuit_ref: circuitRef,
    etape: 3,
    libelle_etape: ETAPES[3],
    depense_id: depenseId,
    date_etape: new Date(),
    created_by: createdBy || null
  });
};

/** Créer l'étape 4 : décaissement approuvé par auditeur */
CircuitDepense.creerEtape4 = async function (circuitRef, depenseId, createdBy) {
  return this.create({
    circuit_ref: circuitRef,
    etape: 4,
    libelle_etape: ETAPES[4],
    depense_id: depenseId,
    date_etape: new Date(),
    created_by: createdBy || null
  });
};

/** Créer l'étape 5 : paiement effectué */
CircuitDepense.creerEtape5 = async function (circuitRef, depenseId, createdBy) {
  return this.create({
    circuit_ref: circuitRef,
    etape: 5,
    libelle_etape: ETAPES[5],
    depense_id: depenseId,
    date_etape: new Date(),
    created_by: createdBy || null
  });
};

/** Créer l'étape 6 : validation paiement par le Patron */
CircuitDepense.creerEtape6 = async function (circuitRef, depenseId, createdBy) {
  return this.create({
    circuit_ref: circuitRef,
    etape: 6,
    libelle_etape: ETAPES[6],
    depense_id: depenseId,
    date_etape: new Date(),
    created_by: createdBy || null
  });
};

/** Récupérer le circuit_ref à partir de demande_fonds_id (étape 2) */
CircuitDepense.getCircuitRefByDemandeFondsId = async function (demandeFondsId) {
  const row = await this.findOne({
    where: { demande_fonds_id: demandeFondsId, etape: 2 },
    attributes: ['circuit_ref']
  });
  return row ? row.circuit_ref : null;
};

/** Récupérer le circuit_ref à partir de depense_id (étape 3, 4, 5, 6 ou 7) */
CircuitDepense.getCircuitRefByDepenseId = async function (depenseId) {
  const row = await this.findOne({
    where: { depense_id: depenseId },
    order: [['etape', 'ASC']],
    attributes: ['circuit_ref']
  });
  return row ? row.circuit_ref : null;
};

/** Créer l'étape 7 : bon de sortie de caisse généré (commentaire = URL du PDF) */
CircuitDepense.creerEtape7 = async function (circuitRef, depenseId, createdBy, pdfUrl) {
  return this.create({
    circuit_ref: circuitRef,
    etape: 7,
    libelle_etape: ETAPES[7],
    depense_id: depenseId,
    date_etape: new Date(),
    created_by: createdBy || null,
    commentaire: pdfUrl || null
  });
};

module.exports = CircuitDepense;
