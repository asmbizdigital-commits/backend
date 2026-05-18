const express = require('express');
const { query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const Connaissement = require('../models/Connaissement');
const AssignationBLControleur = require('../models/AssignationBLControleur');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const { isRoleControleurSygram } = require('../utils/userRoles');
const { formatConnaissementForClient } = require('../utils/connaissementApiFormat');
const {
  loadFicheAsmDetail,
  loadUnifiedExtract,
  saveFicheAsmDetail,
  ingestUnifiedExtract,
  saveCommercialInvoiceItems
} = require('../services/connaissementFicheAsmService');

const router = express.Router();
router.use(authenticateToken);

function emitConnaissementsChanged(req) {
  const io = req.app.get('io');
  if (io) {
    io.emit('connaissements:changed', { at: new Date().toISOString() });
  }
}

/** Erreurs MySQL typiques : schéma pas à jour ou migration manquante. */
function isDbSchemaMisalignedError(error) {
  const parent = error?.parent ?? error?.original ?? null;
  const sqlMessage =
    typeof parent?.sqlMessage === 'string'
      ? parent.sqlMessage
      : typeof error?.sqlMessage === 'string'
        ? error.sqlMessage
        : '';
  const code = parent?.code;
  const errno = parent?.errno;
  if (
    code === 'ER_NO_SUCH_TABLE' ||
    code === 'ER_BAD_FIELD_ERROR' ||
    errno === 1146 ||
    errno === 1054
  ) {
    return true;
  }
  return /doesn't exist|n'existe pas|Unknown column|Table .* doesn't exist/i.test(
    `${sqlMessage} ${error?.message || ''}`
  );
}

const normConnId = (id) => String(id ?? '').trim();

/** Création par défaut (colonnes NOT NULL métier sans valeur en base). */
const DEFAULT_LIGNE_CONN = {
  carrier: '-',
  shipperName: '-',
  shipperAddress: '',
  consigneeName: '-',
  consigneeAddress: '',
  vesselName: '-',
  voyageNumber: '-',
  portOfLoading: '-',
  portOfDischarge: '-',
  placeOfDelivery: '-'
};

function parseConnPk(idParam) {
  const n = parseInt(String(idParam ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * GET /api/connaissements (et alias /api/bl-documents)
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
      if (status === 'validated' || status === 'processed') where.isValidated = true;
      else if (status === 'declared') where.isDeclared = true;
      else if (status === 'exported') where.isExported = true;
      else if (status === 'pending') {
        where.isValidated = false;
        where.isDeclared = false;
        where.isExported = false;
      }

      if (isRoleControleurSygram(req.user.role)) {
        const assignRows = await AssignationBLControleur.findAll({
          where: {
            assigneeId: req.user.id,
            statut: { [Op.ne]: 'Annulée' }
          },
          attributes: ['connaissementId']
        });
        const ids = [...new Set(assignRows.map((r) => r.connaissementId))];
        if (ids.length === 0) {
          return res.json({
            success: true,
            documents: [],
            count: 0,
            source: 'connaissements'
          });
        }
        where.id = { [Op.in]: ids };
        where.isValidated = true;
      }

      const rows = await Connaissement.findAll({
        where,
        order: [['created_at', 'DESC']],
        limit: parseInt(limit, 10)
      });

      const blIds = rows.map((d) => d.id);
      const assignationByNormId = new Map();
      if (blIds.length > 0) {
        const assignations = await AssignationBLControleur.findAll({
          where: {
            connaissementId: { [Op.in]: blIds },
            statut: { [Op.ne]: 'Annulée' }
          },
          attributes: ['connaissementId', 'assigneeId', 'createdAt'],
          order: [['created_at', 'DESC']]
        });
        for (const a of assignations) {
          const k = normConnId(a.connaissementId);
          if (k && !assignationByNormId.has(k)) assignationByNormId.set(k, a);
        }
      }

      const assigneeIds = [...new Set([...assignationByNormId.values()].map((a) => a.assigneeId).filter(Boolean))];
      const userById = new Map();
      if (assigneeIds.length > 0) {
        const users = await User.findAll({
          where: { id: { [Op.in]: assigneeIds } },
          attributes: ['id', 'prenom', 'nom', 'role']
        });
        for (const u of users) userById.set(u.id, u);
      }

      const documentsPayload = rows.map((doc) => {
        const json = formatConnaissementForClient(doc);
        const k = normConnId(doc.id);
        const ass = k ? assignationByNormId.get(k) : null;
        if (ass && ass.assigneeId) {
          const assignee = userById.get(ass.assigneeId);
          json.controleAssignee = assignee
            ? { id: assignee.id, prenom: assignee.prenom, nom: assignee.nom }
            : { id: ass.assigneeId, prenom: '', nom: '' };
        } else {
          json.controleAssignee = null;
        }
        return json;
      });

      res.json({
        success: true,
        documents: documentsPayload,
        count: documentsPayload.length,
        source: 'connaissements'
      });
    } catch (error) {
      const parent = error.parent ?? error.original ?? null;
      const sqlMessage = parent?.sqlMessage || '';
      console.error('GET /api/connaissements', error.message, sqlMessage || '');
      const schemaIssue = isDbSchemaMisalignedError(error);
      const exposeDetail =
        process.env.EXPOSE_API_ERRORS === 'true' || process.env.NODE_ENV !== 'production';
      res.status(schemaIssue ? 503 : 500).json({
        success: false,
        message: schemaIssue
          ? 'Schéma base de données incomplet : exécuter sur le serveur (même DATABASE_URL/MySQL que Render) : npm run migrate:asmproclient puis npm run migrate:assignations-connaissements.'
          : 'Erreur lors de la lecture des connaissements',
        ...(schemaIssue ? { reason: 'db_schema_mismatch' } : {}),
        ...(exposeDetail && sqlMessage ? { detail: sqlMessage } : {})
      });
    }
  }
);

/**
 * POST — création. Soit données métier (`bl_number` requis), soit flux legacy ingestion (sans persistance fichier).
 */
router.post('/', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const body = req.body || {};

    const blNumber =
      (body.bl_number && String(body.bl_number).trim()) ||
      (body.blNumber && String(body.blNumber).trim()) ||
      (body.connaissement_bl && String(body.connaissement_bl).trim());

    if (!blNumber) {
      return res.status(400).json({
        success: false,
        message: 'Champ requis : bl_number (ou blNumber / connaissement_bl)'
      });
    }

    const row = await Connaissement.create({
      ...DEFAULT_LIGNE_CONN,
      blNumber,
      carrier: body.carrier || DEFAULT_LIGNE_CONN.carrier,
      shipperName: body.shipper_name || body.shipper || body.shipperName || DEFAULT_LIGNE_CONN.shipperName,
      shipperAddress: body.shipper_address ?? body.shipperAddress ?? '',
      consigneeName: body.consignee_name || body.consignee || body.consigneeName || DEFAULT_LIGNE_CONN.consigneeName,
      consigneeAddress: body.consignee_address ?? body.consigneeAddress ?? '',
      vesselName: body.vessel_name || body.vessel || body.navire || DEFAULT_LIGNE_CONN.vesselName,
      voyageNumber: body.voyage_number || body.numero_voyage || DEFAULT_LIGNE_CONN.voyageNumber,
      portOfLoading: body.port_of_loading || body.portLoading || DEFAULT_LIGNE_CONN.portOfLoading,
      portOfDischarge: body.port_of_discharge || body.portDischarge || DEFAULT_LIGNE_CONN.portOfDischarge,
      placeOfDelivery: body.place_of_delivery ?? body.destination_rdc ?? DEFAULT_LIGNE_CONN.placeOfDelivery,
      goodsDescription: (body.goods_description || body.marchandise) ?? null,
      totalWeightKg:
        body.total_weight_kg != null ? body.total_weight_kg : body.weight != null ? body.weight : null,
      totalMeasurementCbm:
        body.total_measurement_cbm != null ? body.total_measurement_cbm : body.volume_cbm ?? null,
      hsCodeIndicated: body.hs_code_indicated ?? body.code_hs ?? null,
      numeroDossier: body.numero_dossier ?? null,
      numeroFxi: body.numero_fxi ?? null,
      dateEmission: body.date_emission ?? null,
      validationFxi: body.validation_fxi ?? null,
      dateValidationFxi: body.date_validation_fxi ?? null,
      numeroFeri: body.numero_feri ?? body.numeroFeri ?? null,
      eta: body.eta ?? null,
      declarationNumber: body.declaration_number ?? null,
      isExported: Boolean(body.is_exported),
      isDeclared: Boolean(body.is_declared),
      isValidated: Boolean(body.is_validated),
      controleParId: body.controle_par_id ?? null,
      controlePar: body.controle_par ?? null,
      dateControle: body.date_controle ?? null,
      annotationControlleur: body.annotation_controlleur ?? null,
      datetimeAnnotation: body.datetime_annotation ?? null,
      isControlledByController: Boolean(body.is_controlled_by_controller),
      clientNom: body.client_nom ?? null,
      zoneNom: body.zone_nom ?? null,
      adresseMail: body.adresse_mail ?? null,
      dateEmail: body.date_email ?? null
    });

    emitConnaissementsChanged(req);

    res.status(201).json({
      success: true,
      document: formatConnaissementForClient(row),
      source: 'connaissements'
    });
  } catch (error) {
    console.error('POST /api/connaissements', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        success: false,
        message: 'Connaissement déjà existant (bl_number ou id)'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création du connaissement'
    });
  }
});

/**
 * GET /api/connaissements/:id/fiche-detail — données agrégées (B/L, facture, conteneurs, douanes…).
 */
router.get('/:id/fiche-detail', async (req, res) => {
  try {
    const pk = parseConnPk(req.params.id);
    if (!pk) {
      return res.status(400).json({ success: false, message: 'Identifiant de connaissement invalide.' });
    }
    const detail = await loadFicheAsmDetail(pk);
    if (!detail) {
      return res.status(404).json({ success: false, message: 'Connaissement introuvable.' });
    }
    return res.json({ success: true, detail });
  } catch (error) {
    console.error('GET /api/connaissements/:id/fiche-detail', error.message);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la lecture de la fiche'
    });
  }
});

/**
 * GET /api/connaissements/:id/unified-extract — extrait JSON unifié (B/L, facture, douanes, articles…).
 */
router.get('/:id/unified-extract', async (req, res) => {
  try {
    const pk = parseConnPk(req.params.id);
    if (!pk) {
      return res.status(400).json({ success: false, message: 'Identifiant de connaissement invalide.' });
    }
    const extract = await loadUnifiedExtract(pk);
    if (!extract) {
      return res.status(404).json({ success: false, message: 'Connaissement introuvable.' });
    }
    return res.json({ success: true, extract });
  } catch (error) {
    console.error('GET /api/connaissements/:id/unified-extract', error.message);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la génération de l’extrait unifié'
    });
  }
});

/**
 * POST /api/connaissements/:id/ingest-unified — importe un extrait JSON unifié (items, facture, conteneurs…).
 */
router.post('/:id/ingest-unified', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const pk = parseConnPk(req.params.id);
    if (!pk) {
      return res.status(400).json({ success: false, message: 'Identifiant de connaissement invalide.' });
    }
    const detail = await ingestUnifiedExtract(pk, req.body || {});
    emitConnaissementsChanged(req);
    return res.json({ success: true, detail });
  } catch (error) {
    if (error.message === 'NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Connaissement introuvable.' });
    }
    console.error('POST /api/connaissements/:id/ingest-unified', error.message);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de l’import de l’extrait unifié'
    });
  }
});

/**
 * PATCH /api/connaissements/:id/article-items — enregistre les lignes article (machine / châssis / moteur).
 */
router.patch('/:id/article-items', express.json({ limit: '512kb' }), async (req, res) => {
  try {
    const pk = parseConnPk(req.params.id);
    if (!pk) {
      return res.status(400).json({ success: false, message: 'Identifiant de connaissement invalide.' });
    }
    const items = req.body?.items ?? req.body?.commercial_invoice?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Corps attendu : { "items": [ ... ] }'
      });
    }
    const detail = await saveCommercialInvoiceItems(pk, items);
    emitConnaissementsChanged(req);
    return res.json({ success: true, detail });
  } catch (error) {
    if (error.message === 'NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Connaissement introuvable.' });
    }
    if (error.message === 'FACTURE_REQUIRED_FOR_ITEMS') {
      return res.status(422).json({
        success: false,
        message:
          'Aucune facture commerciale liée à ce connaissement. Renseignez d’abord la section facture ou importez l’extrait unifié.'
      });
    }
    console.error('PATCH /api/connaissements/:id/article-items', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de l’enregistrement des lignes article'
    });
  }
});

/**
 * PATCH /api/connaissements/:id/fiche-detail — enregistre les secteurs édités (transaction SQL).
 */
router.patch('/:id/fiche-detail', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const pk = parseConnPk(req.params.id);
    if (!pk) {
      return res.status(400).json({ success: false, message: 'Identifiant de connaissement invalide.' });
    }
    const detail = await saveFicheAsmDetail(pk, req.body || {});
    emitConnaissementsChanged(req);
    return res.json({ success: true, detail });
  } catch (error) {
    if (error.message === 'NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Connaissement introuvable.' });
    }
    if (error.message === 'FACTURE_REQUIRED_FOR_ITEMS') {
      return res.status(422).json({
        success: false,
        message:
          'Impossible d’enregistrer les lignes article : aucune facture commerciale liée. Complétez la facture ou importez l’extrait unifié.'
      });
    }
    console.error('PATCH /api/connaissements/:id/fiche-detail', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de l’enregistrement de la fiche'
    });
  }
});

router.patch('/:id', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const pk = parseConnPk(req.params.id);
    if (!pk) {
      return res.status(400).json({ success: false, message: 'Identifiant de connaissement invalide.' });
    }
    const doc = await Connaissement.findByPk(pk);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Connaissement introuvable.' });
    }

    const body = req.body || {};
    const touchesControleChamps =
      Object.prototype.hasOwnProperty.call(body, 'annotation_controlleur') ||
      Object.prototype.hasOwnProperty.call(body, 'datetime_annotation') ||
      Object.prototype.hasOwnProperty.call(body, 'is_controlled_by_controller');

    const assignationControleur = await AssignationBLControleur.findOne({
      where: {
        connaissementId: doc.id,
        assigneeId: req.user.id,
        statut: { [Op.ne]: 'Annulée' }
      }
    });

    if (body.is_validated === true) {
      if (!isRoleControleurSygram(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Seul un contrôleur Sygram peut valider et clôturer un dossier (FERI).'
        });
      }
      if (!assignationControleur) {
        return res.status(403).json({
          success: false,
          message: 'Vous devez être assigné à ce dossier pour la validation et clôture.'
        });
      }
      if (!doc.isDeclared) {
        return res.status(400).json({
          success: false,
          message: 'Le dossier doit être déclaré avant validation FERI.'
        });
      }
    }

    if (touchesControleChamps) {
      if (!isRoleControleurSygram(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Seul un contrôleur Sygram assigné à ce dossier peut enregistrer ce contrôle.'
        });
      }
      if (!assignationControleur) {
        return res.status(403).json({
          success: false,
          message: 'Vous devez être assigné à ce dossier pour enregistrer le contrôle.'
        });
      }
      if (body.is_controlled_by_controller === true) {
        const ann =
          body.annotation_controlleur != null ? String(body.annotation_controlleur).trim() : '';
        if (!ann) {
          return res.status(400).json({
            success: false,
            message: 'L’annotation du contrôleur est requise pour valider le contrôle.'
          });
        }
        if (!body.datetime_annotation) {
          return res.status(400).json({
            success: false,
            message: 'La date et l’heure d’annotation sont requises.'
          });
        }
      }
    }

    let blNext = doc.blNumber;
    if (body.bl_number != null && String(body.bl_number).trim())
      blNext = String(body.bl_number).trim();
    else if (body.connaissement_bl != null && String(body.connaissement_bl).trim())
      blNext = String(body.connaissement_bl).trim();

    const isLegacyFeriValidate =
      body.is_validated === true &&
      body.numero_fxi !== undefined &&
      body.numero_feri === undefined;

    const nextNumeroFxi = isLegacyFeriValidate
      ? doc.numeroFxi
      : body.numero_fxi !== undefined
        ? body.numero_fxi ?? null
        : doc.numeroFxi;

    const nextNumeroFeri =
      body.numero_feri !== undefined
        ? body.numero_feri === '' || body.numero_feri == null
          ? null
          : String(body.numero_feri)
        : isLegacyFeriValidate
          ? body.numero_fxi == null || body.numero_fxi === ''
            ? null
            : String(body.numero_fxi)
          : doc.numeroFeri;

    await doc.update({
      blNumber: blNext,
      numeroDossier:
        body.numero_dossier !== undefined ? body.numero_dossier ?? null : doc.numeroDossier,
      numeroFxi: nextNumeroFxi,
      dateEmission: body.date_emission !== undefined ? body.date_emission ?? null : doc.dateEmission,
      validationFxi:
        body.validation_fxi !== undefined ? body.validation_fxi ?? null : doc.validationFxi,
      dateValidationFxi:
        body.date_validation_fxi !== undefined
          ? body.date_validation_fxi ?? null
          : doc.dateValidationFxi,
      shipperName:
        body.exportateur !== undefined
          ? String(body.exportateur || '').slice(0, 255)
          : doc.shipperName,
      shipperAddress: doc.shipperAddress,
      consigneeName:
        body.importateur !== undefined
          ? String(body.importateur || '').slice(0, 255)
          : doc.consigneeName,
      consigneeAddress: doc.consigneeAddress,
      vesselName:
        body.navire !== undefined
          ? String(body.navire || '').slice(0, 100) || '-'
          : doc.vesselName,
      voyageNumber:
        body.numero_voyage !== undefined
          ? String(body.numero_voyage || '').slice(0, 50) || doc.voyageNumber
          : doc.voyageNumber,
      portOfLoading:
        body.port_chargement !== undefined
          ? String(body.port_chargement || '').slice(0, 100)
          : doc.portOfLoading,
      portOfDischarge:
        body.port_dechargement !== undefined
          ? String(body.port_dechargement || '').slice(0, 100)
          : doc.portOfDischarge,
      placeOfDelivery:
        body.destination_rdc !== undefined
          ? String(body.destination_rdc || '').slice(0, 100)
          : doc.placeOfDelivery,
      goodsDescription:
        body.marchandise !== undefined ? body.marchandise ?? null : doc.goodsDescription,
      hsCodeIndicated:
        body.code_hs !== undefined ? body.code_hs ?? null : doc.hsCodeIndicated,
      totalMeasurementCbm:
        body.volume_cbm !== undefined && body.volume_cbm !== ''
          ? body.volume_cbm
          : doc.totalMeasurementCbm,
      totalWeightKg:
        body.poids_brut !== undefined && body.poids_brut !== ''
          ? body.poids_brut
          : doc.totalWeightKg,
      eta: body.eta !== undefined ? body.eta ?? null : doc.eta,
      controleParId:
        body.controle_par_id !== undefined ? body.controle_par_id ?? null : doc.controleParId,
      controlePar: body.controle_par !== undefined ? body.controle_par ?? null : doc.controlePar,
      dateControle:
        body.date_controle !== undefined ? body.date_controle ?? null : doc.dateControle,
      declarationNumber:
        body.declaration_number !== undefined
          ? body.declaration_number ?? null
          : doc.declarationNumber,
      isExported: body.is_exported !== undefined ? Boolean(body.is_exported) : doc.isExported,
      isDeclared: body.is_declared !== undefined ? Boolean(body.is_declared) : doc.isDeclared,
      isValidated: body.is_validated !== undefined ? Boolean(body.is_validated) : doc.isValidated,
      numeroFeri: nextNumeroFeri,
      annotationControlleur:
        body.annotation_controlleur !== undefined
          ? body.annotation_controlleur
          : doc.annotationControlleur,
      datetimeAnnotation:
        body.datetime_annotation !== undefined ? body.datetime_annotation : doc.datetimeAnnotation,
      isControlledByController:
        body.is_controlled_by_controller !== undefined
          ? Boolean(body.is_controlled_by_controller)
          : doc.isControlledByController
    });

    emitConnaissementsChanged(req);
    await doc.reload();
    return res.json({
      success: true,
      document: formatConnaissementForClient(doc),
      source: 'connaissements'
    });
  } catch (error) {
    console.error('PATCH /api/connaissements/:id', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du connaissement'
    });
  }
});

module.exports = router;
