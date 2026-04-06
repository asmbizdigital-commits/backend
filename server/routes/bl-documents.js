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
      consignee
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
      consignee: consignee || null
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

module.exports = router;
