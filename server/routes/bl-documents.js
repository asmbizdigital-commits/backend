const express = require('express');
const { query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const BlDocument = require('../models/BlDocument');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

function emitBlDocumentsChanged(req) {
  const io = req.app.get('io');
  if (io) {
    io.emit('bl_documents:changed', { at: new Date().toISOString() });
  }
}

/**
 * GET /api/bl-documents
 * Liste les documents B/L. Param optionnel since (ISO) pour ne récupérer que les lignes plus récentes (polling léger).
 */
router.get(
  '/',
  [
    query('since').optional().isString().trim(),
    query('status').optional().isString().trim(),
    query('limit').optional().isInt({ min: 1, max: 2000 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Paramètres invalides',
          errors: errors.array()
        });
      }

      const { since, status, limit = 500 } = req.query;
      const where = {};

      if (since) {
        const d = new Date(since);
        if (!Number.isNaN(d.getTime())) {
          where.createdAt = { [Op.gt]: d };
        }
      }
      if (status) {
        where.status = status;
      }

      const documents = await BlDocument.findAll({
        where,
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit, 10)
      });

      res.json({
        success: true,
        documents,
        count: documents.length
      });
    } catch (error) {
      console.error('GET /api/bl-documents', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la lecture des documents B/L'
      });
    }
  }
);

/**
 * POST /api/bl-documents — création (optionnel) ; notifie les clients en temps réel.
 * Peut servir d’endpoint pour un service d’ingestion ; sinon les inserts SQL directs restent visibles via le polling.
 */
router.post('/', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const {
      id,
      fileName,
      fileHash,
      blNumber,
      bookingNumber,
      vessel,
      portLoading,
      portDischarge,
      weight,
      rawText,
      status,
      shipper,
      consignee,
      numero_dossier,
      numero_fxi,
      date_emission,
      validation_fxi,
      date_validation_fxi,
      valeur_fob,
      fret_base,
      frais_add,
      assurance,
      total_cif,
      importateur,
      exportateur,
      transitaire,
      armateur,
      type_transport,
      numero_voyage,
      conteneur,
      numero_conteneur,
      destination_rdc,
      eta,
      marchandise,
      pays_provenance,
      code_hs,
      origine,
      poids_net,
      poids_brut,
      volume_cbm,
      teu,
      controle_par_id,
      controle_par,
      date_controle,
      declaration_number
    } = req.body;

    if (!id || !fileName || !fileHash) {
      return res.status(400).json({
        success: false,
        message: 'Champs requis : id, fileName, fileHash'
      });
    }

    const doc = await BlDocument.create({
      id,
      fileName,
      fileHash,
      blNumber: blNumber || null,
      bookingNumber: bookingNumber || null,
      vessel: vessel || null,
      portLoading: portLoading || null,
      portDischarge: portDischarge || null,
      weight: weight || null,
      rawText: rawText || null,
      status: status || 'pending',
      createdAt: new Date(),
      shipper: shipper || null,
      consignee: consignee || null,
      numeroDossier: numero_dossier || null,
      numeroFxi: numero_fxi || validation_fxi || null,
      dateEmission: date_emission || null,
      validationFxi: validation_fxi || null,
      dateValidationFxi: date_validation_fxi || null,
      valeurFob: valeur_fob || null,
      fretBase: fret_base || null,
      fraisAdd: frais_add || null,
      assurance: assurance || null,
      totalCif: total_cif || null,
      importateur: importateur || null,
      exportateur: exportateur || null,
      transitaire: transitaire || null,
      armateur: armateur || null,
      typeTransport: type_transport || null,
      numeroVoyage: numero_voyage || null,
      conteneur: conteneur || null,
      numeroConteneur: numero_conteneur || null,
      destinationRdc: destination_rdc || null,
      eta: eta || null,
      marchandise: marchandise || null,
      paysProvenance: pays_provenance || null,
      codeHs: code_hs || null,
      origine: origine || null,
      poidsNet: poids_net || null,
      poidsBrut: poids_brut || null,
      volumeCbm: volume_cbm || null,
      teu: teu || null,
      controleParId: controle_par_id || null,
      controlePar: controle_par || null,
      dateControle: date_controle || null,
      declarationNumber: declaration_number || null
    });

    emitBlDocumentsChanged(req);

    res.status(201).json({ success: true, document: doc });
  } catch (error) {
    console.error('POST /api/bl-documents', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        success: false,
        message: 'Document déjà existant (file_hash ou id dupliqué)'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création du document B/L'
    });
  }
});

/**
 * PATCH /api/bl-documents/:id
 * Met à jour les informations de fiche / déclaration sur un B/L existant.
 */
router.patch('/:id', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await BlDocument.findByPk(id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document B/L introuvable.' });
    }

    const body = req.body || {};
    const updates = {
      numeroDossier: body.numero_dossier ?? doc.numeroDossier,
      numeroFxi: body.numero_fxi ?? body.validation_fxi ?? doc.numeroFxi,
      dateEmission: body.date_emission ?? doc.dateEmission,
      validationFxi: body.validation_fxi ?? doc.validationFxi,
      dateValidationFxi: body.date_validation_fxi ?? doc.dateValidationFxi,
      valeurFob: body.valeur_fob ?? doc.valeurFob,
      fretBase: body.fret_base ?? doc.fretBase,
      fraisAdd: body.frais_add ?? doc.fraisAdd,
      assurance: body.assurance ?? doc.assurance,
      totalCif: body.total_cif ?? doc.totalCif,
      importateur: body.importateur ?? doc.importateur,
      exportateur: body.exportateur ?? doc.exportateur,
      transitaire: body.transitaire ?? doc.transitaire,
      armateur: body.armateur ?? doc.armateur,
      blNumber: body.connaissement_bl ?? doc.blNumber,
      vessel: body.navire ?? doc.vessel,
      typeTransport: body.type_transport ?? doc.typeTransport,
      numeroVoyage: body.numero_voyage ?? doc.numeroVoyage,
      conteneur: body.conteneur ?? doc.conteneur,
      numeroConteneur: body.numero_conteneur ?? doc.numeroConteneur,
      portLoading: body.port_chargement ?? doc.portLoading,
      portDischarge: body.port_dechargement ?? doc.portDischarge,
      destinationRdc: body.destination_rdc ?? doc.destinationRdc,
      eta: body.eta ?? doc.eta,
      marchandise: body.marchandise ?? doc.marchandise,
      paysProvenance: body.pays_provenance ?? doc.paysProvenance,
      codeHs: body.code_hs ?? doc.codeHs,
      origine: body.origine ?? doc.origine,
      poidsNet: body.poids_net ?? doc.poidsNet,
      poidsBrut: body.poids_brut ?? doc.poidsBrut,
      weight: body.poids_brut ?? doc.weight,
      volumeCbm: body.volume_cbm ?? doc.volumeCbm,
      teu: body.teu ?? doc.teu,
      controleParId: body.controle_par_id ?? doc.controleParId,
      controlePar: body.controle_par ?? doc.controlePar,
      dateControle: body.date_controle ?? doc.dateControle,
      declarationNumber: body.declaration_number ?? doc.declarationNumber
    };

    await doc.update(updates);
    emitBlDocumentsChanged(req);
    return res.json({ success: true, document: doc });
  } catch (error) {
    console.error('PATCH /api/bl-documents/:id', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du document B/L'
    });
  }
});

module.exports = router;
