const express = require('express');
const { query, validationResult } = require('express-validator');
const { Op, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const Connaissement = require('../models/Connaissement');
const AssignationBLControleur = require('../models/AssignationBLControleur');
const AssignationBL = require('../models/AssignationBL');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const {
  isRoleExploitationControleDossiers,
  isSaisisseurRole,
  isManagerBureauRole,
  isResponsableZoneRole
} = require('../utils/userRoles');
const {
  loadUserGeo,
  buildManagerBureauConnaissementWhere,
  managerBureauCanAccessConnaissement
} = require('../utils/managerBureauConnaissementAccess');
const {
  buildResponsableZoneConnaissementWhere,
  responsableZoneCanAccessConnaissement
} = require('../utils/responsableZoneConnaissementAccess');
const { formatConnaissementForClient } = require('../utils/connaissementApiFormat');
const { logDossierActivity, ACTION_TYPES } = require('../utils/dossierActivityLog');
const {
  loadFicheAsmDetail,
  loadUnifiedExtract,
  saveFicheAsmDetail,
  ingestUnifiedExtract,
  saveCommercialInvoiceItems
} = require('../services/connaissementFicheAsmService');
const { sendSygremExportNotificationEmail } = require('../services/emailService');
const DocsFeri = require('../models/DocsFeri');
const DocsZip = require('../models/DocsZip');
const DocsControleBl = require('../models/DocsControleBl');
const multer = require('multer');
const path = require('path');
const { CloudinaryService } = require('../services/cloudinaryService');
const cloudinary = require('cloudinary').v2;

const MAX_DOCS_CONTROLE = 5;

const uploadControleDocs = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExt = /\.(pdf|jpe?g|png|gif|webp|doc|docx|xls|xlsx)$/i;
    const allowedMime = /^(application\/pdf|image\/|application\/msword|application\/vnd\.)/i;
    const ok =
      allowedExt.test(path.extname(file.originalname || '')) ||
      allowedMime.test(String(file.mimetype || ''));
    if (ok) cb(null, true);
    else cb(new Error('Type de fichier non autorisé (PDF, images, Office)'));
  }
});

const router = express.Router();
router.use(authenticateToken);

function formatDocsFeri(doc) {
  if (!doc) return null;
  const plain = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  return {
    id: plain.id,
    doc_connaissement_id: plain.docConnaissementId ?? plain.doc_connaissement_id,
    file_url: plain.fileUrl ?? plain.file_url,
    cloudinary_public_id: plain.cloudinaryPublicId ?? plain.cloudinary_public_id,
    original_filename: plain.originalFilename ?? plain.original_filename,
    created_at: plain.createdAt ?? plain.created_at,
    updated_at: plain.updatedAt ?? plain.updated_at
  };
}

function formatDocsZip(doc) {
  if (!doc) return null;
  const plain = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  return {
    id: plain.id,
    doc_connaissement_id: plain.docConnaissementId ?? plain.doc_connaissement_id,
    file_url: plain.fileUrl ?? plain.file_url,
    cloudinary_public_id: plain.cloudinaryPublicId ?? plain.cloudinary_public_id,
    original_filename: plain.originalFilename ?? plain.original_filename,
    created_at: plain.createdAt ?? plain.created_at,
    updated_at: plain.updatedAt ?? plain.updated_at
  };
}

function formatDocsControle(doc) {
  if (!doc) return null;
  const plain = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  return {
    id: plain.id,
    connaissement_id: plain.connaissementId ?? plain.connaissement_id,
    file_url: plain.fileUrl ?? plain.file_url,
    cloudinary_public_id: plain.cloudinaryPublicId ?? plain.cloudinary_public_id,
    original_filename: plain.originalFilename ?? plain.original_filename,
    mime_type: plain.mimeType ?? plain.mime_type,
    uploaded_by: plain.uploadedBy ?? plain.uploaded_by,
    created_at: plain.createdAt ?? plain.created_at,
    updated_at: plain.updatedAt ?? plain.updated_at
  };
}

async function uploadControleFileToCloudinary(file, connaissementId) {
  const mime = String(file.mimetype || 'application/octet-stream');
  const isImage = mime.startsWith('image/');
  const folder = `asm-clients/controle-bl/${connaissementId}`;

  if (isImage) {
    const result = await CloudinaryService.uploadBuffer(file.buffer, folder, {
      mimetype: mime,
      use_filename: true,
      unique_filename: true,
      access_mode: 'public'
    });
    if (!result?.success) {
      throw new Error(result?.error || 'Échec upload Cloudinary');
    }
    return {
      url: result.secure_url || result.url,
      publicId: result.public_id
    };
  }

  const dataUri = `data:${mime};base64,${file.buffer.toString('base64')}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    resource_type: 'raw',
    use_filename: true,
    unique_filename: true,
    access_mode: 'public'
  });
  return {
    url: result.secure_url || result.url,
    publicId: result.public_id
  };
}

async function assertCanManageControleDocs(req, connaissementId) {
  if (isRoleExploitationControleDossiers(req.user.role)) {
    const assignation = await AssignationBLControleur.findOne({
      where: {
        connaissementId,
        assigneeId: req.user.id,
        statut: { [Op.ne]: 'Annulée' }
      }
    });
    if (!assignation) {
      return { ok: false, status: 403, message: 'Vous devez être assigné à ce dossier pour gérer les pièces jointes.' };
    }
    return { ok: true };
  }
  if (['Administrateur', 'Patron', 'Directeur Opérations', 'Directeur Operations'].includes(req.user.role)) {
    return { ok: true };
  }
  return { ok: false, status: 403, message: 'Permission insuffisante pour gérer les pièces jointes de contrôle.' };
}

/**
 * GET /api/connaissements/docs-feri?ids=1,2,3
 * Liste des pièces jointes FERI pour plusieurs connaissements.
 */
router.get('/docs-feri', async (req, res) => {
  try {
    const raw = String(req.query.ids || req.query.connaissement_ids || '').trim();
    if (!raw) {
      return res.status(400).json({ message: 'Paramètre ids requis' });
    }
    const ids = [...new Set(
      raw
        .split(',')
        .map((v) => parseInt(String(v).trim(), 10))
        .filter((n) => !Number.isNaN(n) && n > 0)
    )];
    if (!ids.length) {
      return res.status(400).json({ message: 'Aucun id connaissement valide' });
    }

    const docs = await DocsFeri.findAll({
      where: { docConnaissementId: ids },
      order: [['id', 'ASC']]
    });

    return res.json({
      success: true,
      documents: docs.map(formatDocsFeri)
    });
  } catch (error) {
    console.error('GET /docs-feri error:', error);
    return res.status(500).json({
      message: error.message || 'Erreur lors du chargement des pièces jointes FERI'
    });
  }
});

/**
 * GET /api/connaissements/:id/docs-feri
 * Pièce(s) jointe(s) FERI d'un connaissement.
 */
router.get('/:id/docs-feri', async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ message: 'Identifiant invalide' });
    }

    const docs = await DocsFeri.findAll({
      where: { docConnaissementId: id },
      order: [['id', 'ASC']]
    });

    return res.json({
      success: true,
      documents: docs.map(formatDocsFeri)
    });
  } catch (error) {
    console.error('GET /:id/docs-feri error:', error);
    return res.status(500).json({
      message: error.message || 'Erreur lors du chargement des pièces jointes FERI'
    });
  }
});

/**
 * GET /api/connaissements/:id/docs-zip
 * Archive(s) ZIP liée(s) à un connaissement.
 */
router.get('/:id/docs-zip', async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ message: 'Identifiant invalide' });
    }

    const docs = await DocsZip.findAll({
      where: { docConnaissementId: id },
      order: [['id', 'ASC']]
    });

    return res.json({
      success: true,
      documents: docs.map(formatDocsZip)
    });
  } catch (error) {
    console.error('GET /:id/docs-zip error:', error);
    return res.status(500).json({
      message: error.message || 'Erreur lors du chargement des archives ZIP'
    });
  }
});

/**
 * GET /api/connaissements/:id/docs
 * Pièces jointes groupées (feri, zip, controle) — une requête au lieu de 2–3.
 */
router.get('/:id/docs', async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ message: 'Identifiant invalide' });
    }

    const types = String(req.query.types || 'feri,zip,controle')
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const wantFeri = types.includes('feri');
    const wantZip = types.includes('zip');
    const wantControle = types.includes('controle');

    const [feriDocs, zipDocs, controleDocs] = await Promise.all([
      wantFeri
        ? DocsFeri.findAll({ where: { docConnaissementId: id }, order: [['id', 'ASC']] })
        : Promise.resolve([]),
      wantZip
        ? DocsZip.findAll({ where: { docConnaissementId: id }, order: [['id', 'ASC']] })
        : Promise.resolve([]),
      wantControle
        ? DocsControleBl.findAll({ where: { connaissementId: id }, order: [['id', 'ASC']] })
        : Promise.resolve([])
    ]);

    const payload = { success: true };
    if (wantFeri) payload.feri = feriDocs.map(formatDocsFeri);
    if (wantZip) payload.zip = zipDocs.map(formatDocsZip);
    if (wantControle) {
      payload.controle = controleDocs.map(formatDocsControle);
      payload.maxControle = MAX_DOCS_CONTROLE;
      payload.remainingControle = Math.max(0, MAX_DOCS_CONTROLE - controleDocs.length);
    }

    return res.json(payload);
  } catch (error) {
    console.error('GET /:id/docs error:', error);
    return res.status(500).json({
      message: error.message || 'Erreur lors du chargement des pièces jointes'
    });
  }
});

/**
 * GET /api/connaissements/:id/docs-controle
 * Liste des pièces jointes de contrôle (max 5).
 */
router.get('/:id/docs-controle', async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ message: 'Identifiant invalide' });
    }

    const docs = await DocsControleBl.findAll({
      where: { connaissementId: id },
      order: [['id', 'ASC']]
    });

    return res.json({
      success: true,
      documents: docs.map(formatDocsControle),
      max: MAX_DOCS_CONTROLE,
      remaining: Math.max(0, MAX_DOCS_CONTROLE - docs.length)
    });
  } catch (error) {
    console.error('GET /:id/docs-controle error:', error);
    return res.status(500).json({
      message: error.message || 'Erreur lors du chargement des pièces jointes de contrôle'
    });
  }
});

/**
 * POST /api/connaissements/:id/docs-controle
 * Upload jusqu'à 5 fichiers (champ `files`).
 */
router.post(
  '/:id/docs-controle',
  (req, res, next) => {
    uploadControleDocs.array('files', MAX_DOCS_CONTROLE)(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message || 'Upload invalide' });
      }
      return next();
    });
  },
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (Number.isNaN(id) || id < 1) {
        return res.status(400).json({ message: 'Identifiant invalide' });
      }

      const conn = await Connaissement.findByPk(id, { attributes: ['id'] });
      if (!conn) {
        return res.status(404).json({ message: 'Connaissement introuvable' });
      }

      const access = await assertCanManageControleDocs(req, id);
      if (!access.ok) {
        return res.status(access.status).json({ message: access.message });
      }

      const existingCount = await DocsControleBl.count({ where: { connaissementId: id } });
      const incoming = Array.isArray(req.files) ? req.files : [];
      if (!incoming.length) {
        return res.status(400).json({ message: 'Aucun fichier reçu (champ files)' });
      }
      if (existingCount + incoming.length > MAX_DOCS_CONTROLE) {
        return res.status(400).json({
          message: `Maximum ${MAX_DOCS_CONTROLE} pièces jointes. Places restantes : ${Math.max(0, MAX_DOCS_CONTROLE - existingCount)}.`
        });
      }

      const created = [];
      for (const file of incoming) {
        const uploaded = await uploadControleFileToCloudinary(file, id);
        if (!uploaded?.url) {
          return res.status(502).json({ message: 'Échec upload Cloudinary' });
        }
        const row = await DocsControleBl.create({
          connaissementId: id,
          fileUrl: uploaded.url,
          cloudinaryPublicId: uploaded.publicId || null,
          originalFilename: file.originalname || null,
          mimeType: file.mimetype || null,
          uploadedBy: req.user.id
        });
        created.push(formatDocsControle(row));
      }

      const total = await DocsControleBl.count({ where: { connaissementId: id } });
      return res.status(201).json({
        success: true,
        documents: created,
        total,
        max: MAX_DOCS_CONTROLE,
        remaining: Math.max(0, MAX_DOCS_CONTROLE - total)
      });
    } catch (error) {
      console.error('POST /:id/docs-controle error:', error);
      return res.status(500).json({
        message: error.message || 'Erreur lors de l\'upload des pièces jointes'
      });
    }
  }
);

/**
 * DELETE /api/connaissements/:id/docs-controle/:docId
 */
router.delete('/:id/docs-controle/:docId', async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const docId = parseInt(String(req.params.docId), 10);
    if (Number.isNaN(id) || id < 1 || Number.isNaN(docId) || docId < 1) {
      return res.status(400).json({ message: 'Identifiant invalide' });
    }

    const access = await assertCanManageControleDocs(req, id);
    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    const doc = await DocsControleBl.findOne({
      where: { id: docId, connaissementId: id }
    });
    if (!doc) {
      return res.status(404).json({ message: 'Pièce jointe introuvable' });
    }

    if (doc.cloudinaryPublicId) {
      try {
        const mime = String(doc.mimeType || '');
        const resourceType = mime.startsWith('image/') ? 'image' : 'raw';
        await cloudinary.uploader.destroy(doc.cloudinaryPublicId, { resource_type: resourceType });
      } catch (cloudErr) {
        console.warn('Cloudinary destroy skipped:', cloudErr.message);
      }
    }

    await doc.destroy();
    const total = await DocsControleBl.count({ where: { connaissementId: id } });
    return res.json({
      success: true,
      total,
      remaining: Math.max(0, MAX_DOCS_CONTROLE - total)
    });
  } catch (error) {
    console.error('DELETE /:id/docs-controle/:docId error:', error);
    return res.status(500).json({
      message: error.message || 'Erreur lors de la suppression'
    });
  }
});

/**
 * POST /api/connaissements/notify-sygrem-export
 * Envoie un email (Sygrem) avec un ou plusieurs fichiers Excel en pièces jointes.
 * Body:
 *  - { numero_dossier, file_name, excel_base64 }
 *  - ou { numero_dossier, files: [{ file_name, excel_base64 }, ...] }
 */
router.post('/notify-sygrem-export', async (req, res) => {
  try {
    const numeroDossier = String(req.body?.numero_dossier || req.body?.numeroDossier || '').trim();
    if (!numeroDossier) {
      return res.status(400).json({ message: 'numero_dossier requis' });
    }

    const attachments = [];
    const filesInput = Array.isArray(req.body?.files) ? req.body.files : null;

    if (filesInput && filesInput.length) {
      for (const item of filesInput) {
        const name = String(item?.file_name || item?.fileName || '').trim();
        const b64 = String(item?.excel_base64 || item?.excelBase64 || '').trim();
        if (!name || !b64) continue;
        let buf;
        try {
          buf = Buffer.from(b64, 'base64');
        } catch {
          return res.status(400).json({ message: `excel_base64 invalide pour ${name}` });
        }
        if (!buf.length) continue;
        attachments.push({ fileName: name, buffer: buf });
      }
    } else {
      const fileName = String(req.body?.file_name || req.body?.fileName || '').trim();
      const excelBase64 = String(req.body?.excel_base64 || req.body?.excelBase64 || '').trim();
      if (!excelBase64) {
        return res.status(400).json({ message: 'excel_base64 ou files[] requis' });
      }
      let excelBuffer;
      try {
        excelBuffer = Buffer.from(excelBase64, 'base64');
      } catch (decodeErr) {
        return res.status(400).json({ message: 'excel_base64 invalide' });
      }
      if (!excelBuffer.length) {
        return res.status(400).json({ message: 'Fichier Excel vide' });
      }
      attachments.push({
        fileName: fileName || `${numeroDossier} - cargaison.xlsx`,
        buffer: excelBuffer
      });
    }

    if (!attachments.length) {
      return res.status(400).json({ message: 'Aucun fichier Excel valide' });
    }

    const emailResult = await sendSygremExportNotificationEmail({
      numeroDossier,
      attachments
    });

    if (!emailResult.sent) {
      return res.status(502).json({
        message: emailResult.error || 'Échec envoi email Sygrem',
        email: emailResult
      });
    }

    return res.json({
      success: true,
      message: 'Notification Sygrem envoyée',
      email: emailResult,
      filesCount: attachments.length
    });
  } catch (error) {
    console.error('notify-sygrem-export error:', error);
    return res.status(500).json({
      message: error.message || 'Erreur lors de la notification Sygrem'
    });
  }
});

function emitConnaissementsChanged(req, connaissementId = null) {
  const io = req.app.get('io');
  if (io) {
    io.emit('connaissements:changed', {
      at: new Date().toISOString(),
      id: connaissementId != null ? Number(connaissementId) : null
    });
  }
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

const CONN_GEO_INCLUDES = [
  {
    model: require('../models/Zone'),
    as: 'Zone',
    attributes: ['id', 'code', 'nom'],
    required: false
  },
  {
    model: require('../models/DirectionProvinciale'),
    as: 'DirectionProvinciale',
    attributes: ['id', 'nom', 'code', 'province'],
    required: false
  },
  {
    model: require('../models/BureauInternational'),
    as: 'BureauInternational',
    attributes: ['id', 'nom', 'code', 'ville', 'pays'],
    required: false
  }
];

function parseOptionalFk(value) {
  if (value === undefined) return undefined;
  if (value === '' || value === null) return null;
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) || n < 1 ? null : n;
}

function parseConnPk(idParam) {
  const n = parseInt(String(idParam ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const CONN_ACCESS_ATTRS = ['id', 'zoneConnaissement', 'directionConnaissement', 'bureauConnaissement'];

async function ensureManagerBureauConnaissementAccess(req, docOrPk) {
  const needsSaisisseur = isSaisisseurRole(req.user?.role);
  const needsManager = isManagerBureauRole(req.user?.role);
  const needsZone = isResponsableZoneRole(req.user?.role);
  if (!needsSaisisseur && !needsManager && !needsZone) {
    return { allowed: true, doc: typeof docOrPk === 'object' ? docOrPk : null };
  }
  const doc =
    typeof docOrPk === 'object' && docOrPk !== null
      ? docOrPk
      : await Connaissement.findByPk(docOrPk, { attributes: CONN_ACCESS_ATTRS });
  if (!doc) {
    return { allowed: false, status: 404, message: 'Connaissement introuvable.' };
  }
  if (needsSaisisseur) {
    const assignation = await AssignationBL.findOne({
      where: {
        connaissementId: doc.id,
        assigneeId: req.user.id,
        statut: { [Op.in]: ['Assignée', 'En cours', 'Terminée'] }
      },
      attributes: ['id']
    });
    if (!assignation) {
      return {
        allowed: false,
        status: 403,
        message: 'Accès non autorisé : ce dossier ne vous est pas assigné.'
      };
    }
  }
  if (needsManager) {
    const userGeo = await loadUserGeo(req.user.id);
    const allowed = await managerBureauCanAccessConnaissement(userGeo, doc);
    if (!allowed) {
      return {
        allowed: false,
        status: 403,
        message: 'Accès non autorisé à ce connaissement (hors de votre zone / direction / bureau).'
      };
    }
  }
  if (needsZone) {
    const allowed = await responsableZoneCanAccessConnaissement(req.user, doc);
    if (!allowed) {
      return {
        allowed: false,
        status: 403,
        message:
          'Accès non autorisé à ce connaissement (hors des directions / bureaux qui vous sont assignés).'
      };
    }
  }
  return { allowed: true, doc };
}

async function enrichConnaissementRows(rows) {
  const blIds = (rows || []).map((d) => d.id).filter((id) => id != null);
  const bvByConnId = new Map();
  if (blIds.length > 0) {
    try {
      const douaniers = await sequelize.query(
        `SELECT connaissement_id, bv_number FROM documents_douaniers
         WHERE connaissement_id IN (:ids)`,
        {
          replacements: { ids: blIds },
          type: QueryTypes.SELECT
        }
      );
      for (const dd of douaniers) {
        if (dd?.connaissement_id != null) {
          bvByConnId.set(Number(dd.connaissement_id), dd.bv_number || '');
        }
      }
    } catch (err) {
      console.error('enrichConnaissementRows documents_douaniers:', err.message);
    }
  }

  const controleAssignByNormId = new Map();
  const saisiAssignByNormId = new Map();
  if (blIds.length > 0) {
    try {
      const [controleAssignations, saisiAssignations] = await Promise.all([
        AssignationBLControleur.findAll({
          where: {
            connaissementId: { [Op.in]: blIds },
            statut: { [Op.ne]: 'Annulée' }
          },
          attributes: ['connaissementId', 'assigneeId', 'createdAt'],
          order: [['createdAt', 'DESC']]
        }),
        AssignationBL.findAll({
          where: {
            connaissementId: { [Op.in]: blIds },
            statut: { [Op.ne]: 'Annulée' }
          },
          attributes: ['connaissementId', 'assigneeId', 'createdAt'],
          order: [['createdAt', 'DESC']]
        })
      ]);
      for (const a of controleAssignations) {
        const k = normConnId(a.connaissementId);
        if (k && !controleAssignByNormId.has(k)) controleAssignByNormId.set(k, a);
      }
      for (const a of saisiAssignations) {
        const k = normConnId(a.connaissementId);
        if (k && !saisiAssignByNormId.has(k)) saisiAssignByNormId.set(k, a);
      }
    } catch (err) {
      console.error('enrichConnaissementRows assignations:', err.message);
    }
  }

  const supportClientIds = [
    ...new Set(
      rows
        .map((d) => {
          const plain = typeof d.toJSON === 'function' ? d.toJSON() : d;
          return plain.controleParId ?? plain.controle_par_id ?? null;
        })
        .filter((id) => id != null && id !== '')
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  ];

  const assigneeIds = [
    ...new Set(
      [
        ...[...controleAssignByNormId.values(), ...saisiAssignByNormId.values()].map((a) => a.assigneeId),
        ...supportClientIds
      ]
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  ];
  const userById = new Map();
  if (assigneeIds.length > 0) {
    try {
      const users = await User.findAll({
        where: { id: { [Op.in]: assigneeIds } },
        attributes: ['id', 'prenom', 'nom', 'role']
      });
      for (const u of users) userById.set(Number(u.id), u);
    } catch (err) {
      console.error('enrichConnaissementRows users:', err.message);
    }
  }

  const toAssigneePayload = (ass) => {
    if (!ass?.assigneeId) return null;
    const assigneeId = Number(ass.assigneeId);
    const assignee = userById.get(assigneeId);
    return assignee
      ? { id: assignee.id, prenom: assignee.prenom, nom: assignee.nom, role: assignee.role }
      : { id: assigneeId, prenom: '', nom: '' };
  };

  const toUserPayload = (userId) => {
    if (userId == null || userId === '') return null;
    const id = Number(userId);
    if (!Number.isFinite(id) || id <= 0) return null;
    const assignee = userById.get(id);
    return assignee
      ? { id: assignee.id, prenom: assignee.prenom, nom: assignee.nom, role: assignee.role }
      : { id, prenom: '', nom: '' };
  };

  return rows.map((doc) => {
    const json = formatConnaissementForClient(doc);
    json.bvNumber = bvByConnId.get(Number(doc.id)) || '';
    json.bv_number = json.bvNumber;
    const k = normConnId(doc.id);
    json.controleAssignee = toAssigneePayload(k ? controleAssignByNormId.get(k) : null);
    json.saisiAssignee = toAssigneePayload(k ? saisiAssignByNormId.get(k) : null);
    /** Support client (call center) = utilisateur lié via controle_par_id */
    json.supportClientAssignee = toUserPayload(json.controleParId ?? json.controle_par_id);
    return json;
  });
}

function maxTimestampFromRows(rows) {
  let maxTs = null;
  for (const row of rows) {
    const plain = typeof row.toJSON === 'function' ? row.toJSON() : row;
    const ts = plain.updatedAt || plain.updated_at || plain.createdAt || plain.created_at;
    if (ts && (!maxTs || new Date(ts) > new Date(maxTs))) {
      maxTs = ts;
    }
  }
  return maxTs ? new Date(maxTs).toISOString() : null;
}

/**
 * GET /api/connaissements (et alias /api/bl-documents)
 */
router.get(
  '/',
  [
    query('since').optional().isString().trim(),
    query('updated_since').optional().isString().trim(),
    query('ids').optional().isString().trim(),
    query('page').optional().isInt({ min: 1 }),
    query('status').optional().isString().trim(),
    query('stage').optional().isString().trim(),
    query('q').optional().isString().trim(),
    query('sort_by').optional().isString().trim(),
    query('sort_dir').optional().isIn(['asc', 'desc', 'ASC', 'DESC']),
    query('limit').optional().isInt({ min: 1, max: 500 })
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

      const {
        since,
        updated_since: updatedSince,
        ids: idsRaw,
        status,
        stage: stageRaw,
        q: qRaw,
        sort_by: sortByRaw,
        sort_dir: sortDirRaw
      } = req.query;
      const pageNum = Math.max(1, parseInt(String(req.query.page || 1), 10) || 1);
      const limitNum = Math.min(500, Math.max(1, parseInt(String(req.query.limit || 200), 10) || 200));
      const fetchByIds = String(idsRaw || '').trim();
      const stage = String(stageRaw || '').trim().toLowerCase();
      const searchQ = String(qRaw || '').trim();

      const where = {};
      const isControleurViewer = isRoleExploitationControleDossiers(req.user.role);
      const isSaisisseurViewer = isSaisisseurRole(req.user.role);

      if (fetchByIds) {
        const idList = [...new Set(
          fetchByIds
            .split(',')
            .map((v) => parseInt(String(v).trim(), 10))
            .filter((n) => !Number.isNaN(n) && n > 0)
        )];
        if (!idList.length) {
          return res.status(400).json({ success: false, message: 'Aucun id connaissement valide' });
        }
        where.id = { [Op.in]: idList };
      }

      if (since) {
        const d = new Date(since);
        if (!Number.isNaN(d.getTime())) {
          where.createdAt = { [Op.gt]: d };
        }
      }

      if (updatedSince) {
        const d = new Date(updatedSince);
        if (!Number.isNaN(d.getTime())) {
          where.updatedAt = { [Op.gt]: d };
        }
      }

      const hasNumeroDossier = {
        [Op.and]: [{ numeroDossier: { [Op.ne]: null } }, { numeroDossier: { [Op.ne]: '' } }]
      };
      const noNumeroDossier = {
        [Op.or]: [{ numeroDossier: null }, { numeroDossier: '' }]
      };

      // Stages métier (pagination onglets Traitement / Contrôle).
      if (stage === 'bl-extracteur') {
        Object.assign(where, noNumeroDossier);
      } else if (stage === 'saisi' || stage === 'saisi-dossier') {
        Object.assign(where, hasNumeroDossier, { isExported: false });
      } else if (stage === 'declaration' || stage === 'controle-conformite') {
        Object.assign(where, hasNumeroDossier, { isExported: true, isDeclared: false });
      } else if (stage === 'cloture-controle') {
        Object.assign(where, hasNumeroDossier, { isDeclared: true, isValidated: false });
      } else if (stage === 'controle-dossiers') {
        Object.assign(where, hasNumeroDossier, { isValidated: true });
      } else if (!isControleurViewer) {
        if (status === 'validated' || status === 'processed') where.isValidated = true;
        else if (status === 'declared') where.isDeclared = true;
        else if (status === 'exported') where.isExported = true;
        else if (status === 'pending') {
          where.isValidated = false;
          where.isDeclared = false;
          where.isExported = false;
        }
      }

      if (searchQ) {
        const like = `%${searchQ}%`;
        where[Op.and] = [
          ...(Array.isArray(where[Op.and]) ? where[Op.and] : where[Op.and] ? [where[Op.and]] : []),
          {
            [Op.or]: [
              { blNumber: { [Op.like]: like } },
              { numeroDossier: { [Op.like]: like } },
              { vesselName: { [Op.like]: like } },
              { consigneeName: { [Op.like]: like } },
              { controlePar: { [Op.like]: like } },
              { numeroFeri: { [Op.like]: like } }
            ]
          }
        ];
      }

      if (isControleurViewer) {
        const assignRows = await AssignationBLControleur.findAll({
          where: {
            assigneeId: req.user.id,
            statut: { [Op.in]: ['Assignée', 'En cours', 'Terminée'] }
          },
          attributes: ['connaissementId']
        });
        const assignedIds = [...new Set(assignRows.map((r) => r.connaissementId).filter(Boolean))];
        if (assignedIds.length === 0) {
          return res.json({
            success: true,
            documents: [],
            count: 0,
            total: 0,
            page: pageNum,
            limit: limitNum,
            hasMore: false,
            maxUpdatedAt: null,
            source: 'connaissements',
            scope: 'assigned_controleur'
          });
        }
        if (where.id?.[Op.in]) {
          const allowed = new Set(assignedIds.map(Number));
          where.id = { [Op.in]: where.id[Op.in].filter((id) => allowed.has(Number(id))) };
          if (!where.id[Op.in].length) {
            return res.json({
              success: true,
              documents: [],
              count: 0,
              total: 0,
              page: pageNum,
              limit: limitNum,
              hasMore: false,
              maxUpdatedAt: null,
              source: 'connaissements',
              scope: 'assigned_controleur'
            });
          }
        } else {
          where.id = { [Op.in]: assignedIds };
        }
        // Sans stage explicite : tous les dossiers assignés (historique).
        if (!stage) {
          delete where.isValidated;
          delete where.isDeclared;
          delete where.isExported;
        }
      }

      if (isSaisisseurViewer) {
        const assignRows = await AssignationBL.findAll({
          where: {
            assigneeId: req.user.id,
            statut: { [Op.in]: ['Assignée', 'En cours', 'Terminée'] }
          },
          attributes: ['connaissementId']
        });
        const assignedIds = [...new Set(assignRows.map((r) => r.connaissementId).filter(Boolean))];
        if (assignedIds.length === 0) {
          return res.json({
            success: true,
            documents: [],
            count: 0,
            total: 0,
            page: pageNum,
            limit: limitNum,
            hasMore: false,
            maxUpdatedAt: null,
            source: 'connaissements',
            scope: 'assigned_saisisseur'
          });
        }
        if (where.id?.[Op.in]) {
          const allowed = new Set(assignedIds.map(Number));
          where.id = { [Op.in]: where.id[Op.in].filter((id) => allowed.has(Number(id))) };
          if (!where.id[Op.in].length) {
            return res.json({
              success: true,
              documents: [],
              count: 0,
              total: 0,
              page: pageNum,
              limit: limitNum,
              hasMore: false,
              maxUpdatedAt: null,
              source: 'connaissements',
              scope: 'assigned_saisisseur'
            });
          }
        } else {
          where.id = { [Op.in]: assignedIds };
        }
      }

      if (!isControleurViewer && !isSaisisseurViewer && isManagerBureauRole(req.user.role)) {
        const userGeo = await loadUserGeo(req.user.id);
        const geoWhere = await buildManagerBureauConnaissementWhere(userGeo);
        if (geoWhere) {
          Object.assign(where, geoWhere);
        }
      }

      if (!isControleurViewer && !isSaisisseurViewer && isResponsableZoneRole(req.user.role)) {
        const zoneWhere = await buildResponsableZoneConnaissementWhere(req.user);
        if (zoneWhere) {
          Object.assign(where, zoneWhere);
        }
      }

      // Noms de colonnes SQL (underscored) — les attributs camelCase cassent le ORDER BY MySQL.
      const sortMap = {
        created_at: 'created_at',
        updated_at: 'updated_at',
        bl_number: 'bl_number',
        numero_dossier: 'numero_dossier',
        vessel: 'vessel_name',
        vessel_name: 'vessel_name',
        dateMaj: 'created_at',
        updated: 'updated_at',
        reference: 'numero_dossier',
        numeroBL: 'bl_number',
        blNumber: 'bl_number',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        numeroDossier: 'numero_dossier',
        vesselName: 'vessel_name'
      };
      const sortCol = sortMap[String(sortByRaw || '').trim()] || 'created_at';
      const sortDir = String(sortDirRaw || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      const usePagination = !fetchByIds && !updatedSince;
      const queryOptions = {
        where,
        include: CONN_GEO_INCLUDES,
        order: [[sequelize.col(`Connaissement.${sortCol}`), sortDir]]
      };

      let rows;
      let total = 0;
      if (usePagination) {
        const [foundRows, counted] = await Promise.all([
          Connaissement.findAll({
            ...queryOptions,
            limit: limitNum,
            offset: (pageNum - 1) * limitNum
          }),
          Connaissement.count({ where })
        ]);
        rows = foundRows;
        total = counted;
      } else {
        rows = await Connaissement.findAll({
          ...queryOptions,
          limit: fetchByIds ? limitNum : Math.min(limitNum, 500)
        });
        total = rows.length;
      }

      const documentsPayload = await enrichConnaissementRows(rows);
      const maxUpdatedAt = maxTimestampFromRows(rows);
      const hasMore = usePagination ? pageNum * limitNum < total : false;

      const scope = isControleurViewer
        ? 'assigned_controleur'
        : isSaisisseurViewer
          ? 'assigned_saisisseur'
          : undefined;

      res.json({
        success: true,
        documents: documentsPayload,
        count: documentsPayload.length,
        total: usePagination ? total : documentsPayload.length,
        page: pageNum,
        limit: limitNum,
        hasMore,
        maxUpdatedAt,
        serverTime: new Date().toISOString(),
        source: 'connaissements',
        ...(scope ? { scope } : {}),
        ...(stage ? { stage } : {})
      });
    } catch (error) {
      const parent = error.parent ?? error.original ?? null;
      const sqlMessage = parent?.sqlMessage || '';
      console.error('GET /api/connaissements', error.message, sqlMessage || '');
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la lecture des connaissements'
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
      zoneConnaissement: parseOptionalFk(body.zone_connaissement ?? body.zoneConnaissement),
      directionConnaissement: parseOptionalFk(
        body.direction_connaissement ?? body.directionConnaissement
      ),
      bureauConnaissement: parseOptionalFk(body.bureau_connaissement ?? body.bureauConnaissement),
      adresseMail: body.adresse_mail ?? null,
      dateEmail: body.date_email ?? null
    });

    emitConnaissementsChanged(req, row.id);

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
    const access = await ensureManagerBureauConnaissementAccess(req, pk);
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
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
    const access = await ensureManagerBureauConnaissementAccess(req, pk);
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
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
    const access = await ensureManagerBureauConnaissementAccess(req, pk);
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }
    const detail = await ingestUnifiedExtract(pk, req.body || {});
    emitConnaissementsChanged(req, pk);
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
    const access = await ensureManagerBureauConnaissementAccess(req, pk);
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }
    const items = req.body?.items ?? req.body?.commercial_invoice?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Corps attendu : { "items": [ ... ] }'
      });
    }
    const detail = await saveCommercialInvoiceItems(pk, items);
    emitConnaissementsChanged(req, pk);
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
    const access = await ensureManagerBureauConnaissementAccess(req, pk);
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
    }
    const detail = await saveFicheAsmDetail(pk, req.body || {});
    emitConnaissementsChanged(req, pk);
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

    const access = await ensureManagerBureauConnaissementAccess(req, doc);
    if (!access.allowed) {
      return res.status(access.status).json({ success: false, message: access.message });
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
      if (!isRoleExploitationControleDossiers(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Seul un Verificateur Sygrem ou Controlleur Sygram peut valider et clôturer un dossier (FERI).'
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
      if (!isRoleExploitationControleDossiers(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Seul un Verificateur Sygrem ou Controlleur Sygram assigné peut enregistrer ce contrôle.'
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

    const wasExported = Boolean(doc.isExported);
    const wasDeclared = Boolean(doc.isDeclared);
    const wasControlled = Boolean(doc.isControlledByController);
    const wasValidated = Boolean(doc.isValidated);
    const prevDeclaration = doc.declarationNumber;
    const prevFeri = doc.numeroFeri;

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
          : doc.isControlledByController,
      zoneConnaissement:
        body.zone_connaissement !== undefined || body.zoneConnaissement !== undefined
          ? parseOptionalFk(body.zone_connaissement ?? body.zoneConnaissement)
          : doc.zoneConnaissement,
      directionConnaissement:
        body.direction_connaissement !== undefined || body.directionConnaissement !== undefined
          ? parseOptionalFk(body.direction_connaissement ?? body.directionConnaissement)
          : doc.directionConnaissement,
      bureauConnaissement:
        body.bureau_connaissement !== undefined || body.bureauConnaissement !== undefined
          ? parseOptionalFk(body.bureau_connaissement ?? body.bureauConnaissement)
          : doc.bureauConnaissement
    });

    try {
      const baseMeta = {
        numero_dossier: doc.numeroDossier,
        bl_number: doc.blNumber
      };
      if (body.is_exported === true && !wasExported) {
        await logDossierActivity(req, {
          connaissementId: doc.id,
          actionType: ACTION_TYPES.EXPORT_SYGREM,
          dossierRef: doc.numeroDossier,
          blNumber: doc.blNumber,
          metadata: baseMeta
        });
      }
      if (
        body.is_declared === true ||
        (body.declaration_number != null &&
          String(body.declaration_number).trim() &&
          String(body.declaration_number) !== String(prevDeclaration || ''))
      ) {
        if (!wasDeclared || String(body.declaration_number || '') !== String(prevDeclaration || '')) {
          await logDossierActivity(req, {
            connaissementId: doc.id,
            actionType: ACTION_TYPES.ADD_DECLARATION,
            dossierRef: doc.numeroDossier,
            blNumber: doc.blNumber,
            metadata: {
              ...baseMeta,
              declaration_number: body.declaration_number ?? doc.declarationNumber
            }
          });
        }
      }
      if (body.is_controlled_by_controller === true && !wasControlled) {
        await logDossierActivity(req, {
          connaissementId: doc.id,
          actionType: ACTION_TYPES.CONTROLE_VALIDATION,
          dossierRef: doc.numeroDossier,
          blNumber: doc.blNumber,
          metadata: {
            ...baseMeta,
            annotation: body.annotation_controlleur || null,
            datetime_annotation: body.datetime_annotation || null
          }
        });
      }
      if (
        (body.is_validated === true && !wasValidated) ||
        (body.numero_feri != null &&
          String(body.numero_feri).trim() &&
          String(body.numero_feri) !== String(prevFeri || ''))
      ) {
        await logDossierActivity(req, {
          connaissementId: doc.id,
          actionType: ACTION_TYPES.ADD_FERI,
          dossierRef: doc.numeroDossier,
          blNumber: doc.blNumber,
          metadata: {
            ...baseMeta,
            numero_feri: nextNumeroFeri,
            is_validated: body.is_validated === true || wasValidated
          }
        });
      }
    } catch (logErr) {
      console.error('dossier activity log (connaissements PATCH):', logErr.message);
    }

    emitConnaissementsChanged(req, doc.id);
    await doc.reload({ include: CONN_GEO_INCLUDES });
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
