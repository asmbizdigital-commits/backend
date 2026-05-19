/**
 * Fiche ASM unifiée : connaissements + conteneurs + documents_douaniers +
 * factures_commerciales + infos_bancaires + articles_facture + articles_attributes.
 */
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const Connaissement = require('../models/Connaissement');

const ITEM_ATTR_KEYS = ['model', 'machine_no', 'chassis_no', 'engine_no', 'year', 'color'];

/** Noms d’attributs possibles en BDD (extracteur, pivot SQL, libellés FR). */
const ATTR_ALIASES = {
  model: ['model', 'modele', 'modèle', 'product_model'],
  machine_no: [
    'machine_no',
    'machine_number',
    'numero_machine',
    'numéro_machine',
    'machine',
    'no_machine',
    'n_machine',
    'serial_machine'
  ],
  chassis_no: [
    'chassis_no',
    'chassis',
    'chassis_number',
    'numero_chassis',
    'numéro_chassis',
    'no_chassis',
    'vin'
  ],
  engine_no: [
    'engine_no',
    'engine',
    'engine_number',
    'numero_moteur',
    'numéro_moteur',
    'moteur',
    'no_moteur',
    'n_moteur'
  ],
  year: ['year', 'annee', 'année'],
  color: ['color', 'couleur', 'colour']
};

function foldAttrKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function normalizeAttributeKey(raw) {
  const k = foldAttrKey(raw);
  for (const [canonical, aliases] of Object.entries(ATTR_ALIASES)) {
    if (aliases.some((a) => foldAttrKey(a) === k)) return canonical;
  }
  return k;
}

function queryInsertId(result, meta) {
  if (result && typeof result === 'object' && result.insertId != null) return result.insertId;
  if (meta && meta.insertId != null) return meta.insertId;
  return null;
}

function pickItemValue(item, canonical) {
  if (!item || typeof item !== 'object') return null;
  const direct = item[canonical];
  if (direct != null && String(direct).trim() !== '') return String(direct).trim();
  for (const alt of ATTR_ALIASES[canonical] || []) {
    const v = item[alt];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  for (const [k, v] of Object.entries(item)) {
    if (normalizeAttributeKey(k) === canonical && v != null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return null;
}

function normalizeCommercialItem(raw, lineNumber) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {
    line_number: src.line_number != null ? Number(src.line_number) : lineNumber,
    quantity: src.quantity != null ? Number(src.quantity) : 1,
    unit_price: src.unit_price != null ? Number(src.unit_price) : null,
    total_price: src.total_price != null ? Number(src.total_price) : null
  };
  for (const key of ITEM_ATTR_KEYS) {
    out[key] = pickItemValue(src, key);
  }
  return out;
}

function rowToShipperConsignee(c) {
  const j = typeof c.toJSON === 'function' ? c.toJSON() : c;
  return {
    bl_number: j.blNumber,
    carrier: j.carrier,
    shipper: {
      name: j.shipperName || '',
      address: j.shipperAddress || ''
    },
    consignee: {
      name: j.consigneeName || '',
      address: j.consigneeAddress || ''
    },
    vessel_details: {
      vessel_name: j.vesselName || '',
      voyage_number: j.voyageNumber || ''
    },
    routing: {
      port_of_loading: j.portOfLoading || '',
      port_of_discharge: j.portOfDischarge || '',
      place_of_delivery: j.placeOfDelivery || ''
    },
    cargo_summary: {
      goods_description: j.goodsDescription ?? '',
      total_packages: j.totalPackages ?? '',
      total_weight_kg: j.totalWeightKg != null ? Number(j.totalWeightKg) : null,
      total_measurement_cbm: j.totalMeasurementCbm != null ? Number(j.totalMeasurementCbm) : null,
      hs_code_indicated: j.hsCodeIndicated ?? ''
    }
  };
}

async function loadArticlesForFacture(factureId) {
  try {
    const pivoted = await sequelize.query(
      `SELECT * FROM vue_facture_detaillee WHERE facture_id = ? ORDER BY line_number ASC`,
      { replacements: [factureId], type: QueryTypes.SELECT }
    );
    if (pivoted.length > 0) {
      return pivoted.map((r, idx) =>
        normalizeCommercialItem(r, r.line_number != null ? Number(r.line_number) : idx + 1)
      );
    }
  } catch {
    /* vue absente : repli sur articles_facture + articles_attributes */
  }

  const articles = await sequelize.query(
    `SELECT * FROM articles_facture WHERE facture_id = ? ORDER BY line_number ASC`,
    { replacements: [factureId], type: QueryTypes.SELECT }
  );
  const items = [];
  for (const af of articles) {
    const attrs = await sequelize.query(
      `SELECT attribute_name, attribute_value FROM articles_attributes WHERE article_id = ?`,
      { replacements: [af.id], type: QueryTypes.SELECT }
    );
    const item = {
      line_number: af.line_number,
      quantity: af.quantity,
      unit_price: af.unit_price != null ? Number(af.unit_price) : null,
      total_price: af.total_price != null ? Number(af.total_price) : null
    };
    for (const a of attrs) {
      const key = normalizeAttributeKey(a.attribute_name);
      const val = a.attribute_value;
      if (val != null && String(val).trim() !== '') {
        item[key] = String(val).trim();
      }
    }
    items.push(normalizeCommercialItem(item, af.line_number));
  }
  return items;
}

async function upsertCommercialInvoiceItems(factureId, items, transaction) {
  if (!factureId || !Array.isArray(items) || items.length === 0) return;

  const existing = await sequelize.query(
    `SELECT id, line_number FROM articles_facture WHERE facture_id = ? ORDER BY line_number ASC`,
    { replacements: [factureId], type: QueryTypes.SELECT, transaction }
  );

  for (let i = 0; i < items.length; i++) {
    const normalized = normalizeCommercialItem(items[i], i + 1);
    const lineNo = Number.isFinite(normalized.line_number) ? normalized.line_number : i + 1;
    let articleId = existing.find((e) => Number(e.line_number) === lineNo)?.id;
    if (!articleId && existing[i]?.id) {
      articleId = existing[i].id;
    }

    const qty = Number.isFinite(normalized.quantity) ? normalized.quantity : 1;

    if (!articleId) {
      const [insertResult, insertMeta] = await sequelize.query(
        `INSERT INTO articles_facture (facture_id, line_number, quantity, unit_price, total_price)
         VALUES (?, ?, ?, ?, ?)`,
        {
          replacements: [
            factureId,
            lineNo,
            qty,
            normalized.unit_price,
            normalized.total_price
          ],
          transaction
        }
      );
      articleId = queryInsertId(insertResult, insertMeta);
      if (!articleId) {
        const rid = await sequelize.query(
          `SELECT id FROM articles_facture WHERE facture_id = ? AND line_number = ? LIMIT 1`,
          { replacements: [factureId, lineNo], type: QueryTypes.SELECT, transaction }
        );
        articleId = rid[0]?.id;
      }
      if (articleId) existing.push({ id: articleId, line_number: lineNo });
    } else {
      await sequelize.query(
        `UPDATE articles_facture SET
           quantity = COALESCE(?, quantity),
           unit_price = COALESCE(?, unit_price),
           total_price = COALESCE(?, total_price)
         WHERE id = ?`,
        {
          replacements: [qty, normalized.unit_price, normalized.total_price, articleId],
          transaction
        }
      );
    }

    if (!articleId) continue;

    for (const key of ITEM_ATTR_KEYS) {
      const val = normalized[key];
      if (val == null) continue;
      await sequelize.query(
        `INSERT INTO articles_attributes (article_id, attribute_name, attribute_value)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE attribute_value = VALUES(attribute_value)`,
        { replacements: [articleId, key, val], transaction }
      );
    }
  }
}

async function resolveFactureIdForConnaissement(connaissementId, ci, transaction) {
  const existing = await sequelize.query(
    `SELECT id FROM factures_commerciales WHERE connaissement_id = ? ORDER BY id ASC LIMIT 1`,
    { replacements: [connaissementId], type: QueryTypes.SELECT, transaction }
  );
  if (existing[0]?.id) return existing[0].id;

  if (!ci) return null;
  const fin = ci.financials || {};
  const invNum = ci.invoice_number || `AUTO-${connaissementId}-${Date.now()}`.slice(0, 50);
  const [insertResult, insertMeta] = await sequelize.query(
    `INSERT INTO factures_commerciales
     (connaissement_id, invoice_number, invoice_date, contract_number, currency, fob_value, ocean_freight, insurance, total_cip_value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    {
      replacements: [
        connaissementId,
        String(invNum).slice(0, 50),
        ci.date || new Date().toISOString().slice(0, 10),
        ci.contract_number || null,
        fin.currency || 'USD',
        fin.fob_value ?? null,
        fin.ocean_freight ?? null,
        fin.insurance ?? null,
        fin.total_cip_value ?? null
      ],
      transaction
    }
  );
  let factureId = queryInsertId(insertResult, insertMeta);
  if (!factureId) {
    const rid = await sequelize.query(
      `SELECT id FROM factures_commerciales WHERE connaissement_id = ? ORDER BY id DESC LIMIT 1`,
      { replacements: [connaissementId], type: QueryTypes.SELECT, transaction }
    );
    factureId = rid[0]?.id;
  }
  return factureId || null;
}

/**
 * Importe un extrait unifié (commercial_invoice.items, etc.) dans les tables ASM.
 */
async function ingestUnifiedExtract(connaissementId, payload) {
  const id = parseInt(String(connaissementId), 10);
  if (!Number.isFinite(id) || id < 1) throw new Error('INVALID_ID');
  return saveFicheAsmDetail(id, payload || {});
}

function isInvalidDateLiteral(value) {
  if (value == null || value === '') return true;
  const s = String(value).trim().toLowerCase();
  return !s || s === 'invalid date' || s.includes('invalid');
}

/** DATE / DATEONLY MySQL — null si vide ou invalide. */
function sanitizeDateOnly(value) {
  if (isInvalidDateLiteral(value)) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (s.startsWith('0000-00-00')) return null;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** DATETIME MySQL — null si vide ou invalide. */
function sanitizeDateTime(value) {
  if (isInvalidDateLiteral(value)) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value;
  }
  const s = String(value).trim();
  if (s.startsWith('0000-00-00')) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? `${s}:00` : s;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toIsoDateOnly(v) {
  return sanitizeDateOnly(v);
}

/**
 * Formate la fiche agrégée au format extrait unifié (import / export JSON).
 * @param {object} detail — résultat de loadFicheAsmDetail
 */
function buildUnifiedExtractFromFicheDetail(detail) {
  if (!detail) return null;

  const bd = detail.bl_details || {};
  const ci = detail.commercial_invoice;
  const cd = detail.customs_documents;

  const bl_details = {
    bl_number: bd.bl_number ?? null,
    carrier: bd.carrier ?? null,
    shipper: {
      name: bd.shipper?.name ?? '',
      address: bd.shipper?.address ?? ''
    },
    consignee: {
      name: bd.consignee?.name ?? '',
      address: bd.consignee?.address ?? ''
    },
    vessel_details: {
      vessel_name: bd.vessel_details?.vessel_name ?? '',
      voyage_number: bd.vessel_details?.voyage_number ?? ''
    },
    routing: {
      port_of_loading: bd.routing?.port_of_loading ?? '',
      port_of_discharge: bd.routing?.port_of_discharge ?? '',
      place_of_delivery: bd.routing?.place_of_delivery ?? ''
    },
    cargo_summary: {
      goods_description: bd.cargo_summary?.goods_description ?? '',
      total_packages:
        bd.cargo_summary?.total_packages != null
          ? String(bd.cargo_summary.total_packages)
          : '',
      total_weight_kg:
        bd.cargo_summary?.total_weight_kg != null && bd.cargo_summary.total_weight_kg !== ''
          ? Number(bd.cargo_summary.total_weight_kg)
          : null,
      total_measurement_cbm:
        bd.cargo_summary?.total_measurement_cbm != null && bd.cargo_summary.total_measurement_cbm !== ''
          ? Number(bd.cargo_summary.total_measurement_cbm)
          : null,
      hs_code_indicated: bd.cargo_summary?.hs_code_indicated ?? ''
    },
    containers: (bd.containers || []).map((co) => ({
      container_number: co.container_number ?? null,
      seal_number: co.seal_number ?? null,
      type: co.type ?? null,
      weight_kg: co.weight_kg != null ? Number(co.weight_kg) : null,
      measurement_cbm: co.measurement_cbm != null ? Number(co.measurement_cbm) : null
    }))
  };

  let commercial_invoice = null;
  if (ci) {
    const fin = ci.financials || {};
    commercial_invoice = {
      invoice_number: ci.invoice_number ?? null,
      date: toIsoDateOnly(ci.date),
      contract_number: ci.contract_number ?? null,
      financials: {
        currency: fin.currency || 'USD',
        fob_value: fin.fob_value != null && fin.fob_value !== '' ? Number(fin.fob_value) : null,
        ocean_freight:
          fin.ocean_freight != null && fin.ocean_freight !== '' ? Number(fin.ocean_freight) : null,
        insurance: fin.insurance != null && fin.insurance !== '' ? Number(fin.insurance) : null,
        total_cip_value:
          fin.total_cip_value != null && fin.total_cip_value !== ''
            ? Number(fin.total_cip_value)
            : null
      },
      items: (ci.items || []).map((it) => {
        const n = normalizeCommercialItem(it, it.line_number);
        return {
          model: n.model ?? null,
          machine_no: n.machine_no ?? null,
          chassis_no: n.chassis_no ?? null,
          engine_no: n.engine_no ?? null,
          year: n.year ?? null,
          color: n.color ?? null
        };
      }),
      banking_info: ci.banking_info
        ? {
            beneficiary: ci.banking_info.beneficiary ?? null,
            bank_name: ci.banking_info.bank_name ?? null,
            swift_code: ci.banking_info.swift_code ?? null,
            account_number: ci.banking_info.account_number ?? null
          }
        : null
    };
  }

  const customs_documents = cd
    ? {
        feri_number: cd.feri_number ?? null,
        feri_validation_date: toIsoDateOnly(cd.feri_validation_date),
        bv_number: cd.bv_number ?? null
      }
    : null;

  return {
    bl_details,
    commercial_invoice,
    customs_documents
  };
}

/**
 * @returns {Promise<object|null>}
 */
async function loadUnifiedExtract(connaissementId) {
  const detail = await loadFicheAsmDetail(connaissementId);
  if (!detail) return null;
  return buildUnifiedExtractFromFicheDetail(detail);
}

/**
 * @returns {Promise<object|null>}
 */
async function loadFicheAsmDetail(connaissementId) {
  const id = parseInt(String(connaissementId), 10);
  if (!Number.isFinite(id) || id < 1) return null;

  const c = await Connaissement.findByPk(id);
  if (!c) return null;

  const conteneurs = await sequelize.query(
    `SELECT * FROM conteneurs WHERE connaissement_id = ? ORDER BY id ASC`,
    { replacements: [id], type: QueryTypes.SELECT }
  );

  const ddRows = await sequelize.query(
    `SELECT * FROM documents_douaniers WHERE connaissement_id = ? LIMIT 1`,
    { replacements: [id], type: QueryTypes.SELECT }
  );
  const dd = ddRows[0] || null;

  const factures = await sequelize.query(
    `SELECT * FROM factures_commerciales WHERE connaissement_id = ? ORDER BY id ASC`,
    { replacements: [id], type: QueryTypes.SELECT }
  );

  const blBase = rowToShipperConsignee(c);
  blBase.containers = conteneurs.map((co) => ({
    id: co.id,
    container_number: co.container_number,
    seal_number: co.seal_number,
    type: co.type,
    weight_kg: co.weight_kg != null ? Number(co.weight_kg) : null,
    measurement_cbm: co.measurement_cbm != null ? Number(co.measurement_cbm) : null
  }));

  let commercial_invoice = null;
  if (factures.length > 0) {
    const fc = factures[0];
    const bankRows = await sequelize.query(
      `SELECT * FROM infos_bancaires WHERE facture_id = ? LIMIT 1`,
      { replacements: [fc.id], type: QueryTypes.SELECT }
    );
    const bank = bankRows[0] || null;
    const items = await loadArticlesForFacture(fc.id);

    commercial_invoice = {
      facture_id: fc.id,
      invoice_number: fc.invoice_number,
      date: fc.invoice_date,
      contract_number: fc.contract_number,
      financials: {
        currency: fc.currency || 'USD',
        fob_value: fc.fob_value != null ? Number(fc.fob_value) : null,
        ocean_freight: fc.ocean_freight != null ? Number(fc.ocean_freight) : null,
        insurance: fc.insurance != null ? Number(fc.insurance) : null,
        total_cip_value: fc.total_cip_value != null ? Number(fc.total_cip_value) : null
      },
      items,
      banking_info: bank
        ? {
            beneficiary: bank.beneficiary,
            bank_name: bank.bank_name,
            swift_code: bank.swift_code,
            account_number: bank.account_number
          }
        : null
    };
  }

  const customs_documents = dd
    ? {
        feri_number: dd.feri_number,
        feri_validation_date: dd.feri_validation_date,
        bv_number: dd.bv_number
      }
    : null;

  const j = c.toJSON();
  return {
    connaissement_id: id,
    bl_details: blBase,
    commercial_invoice,
    /** Autres factures liées (si plusieurs). */
    factures_commerciales: await Promise.all(
      factures.slice(1).map(async (fc) => ({
        facture_id: fc.id,
        invoice_number: fc.invoice_number,
        date: fc.invoice_date,
        contract_number: fc.contract_number,
        financials: {
          currency: fc.currency,
          fob_value: fc.fob_value != null ? Number(fc.fob_value) : null,
          ocean_freight: fc.ocean_freight != null ? Number(fc.ocean_freight) : null,
          insurance: fc.insurance != null ? Number(fc.insurance) : null,
          total_cip_value: fc.total_cip_value != null ? Number(fc.total_cip_value) : null
        },
        items: await loadArticlesForFacture(fc.id)
      }))
    ),
    customs_documents,
    /** Données brutes utiles au front / PATCH */
    _tables: {
      connaissement: j,
      conteneurs,
      documents_douaniers: dd,
      factures
    }
  };
}

/**
 * Enregistre la fiche : met à jour les tables liées (transaction).
 * @param {number} connaissementId
 * @param {object} body — même forme que loadFicheAsmDetail (champs éditables)
 */
async function saveFicheAsmDetail(connaissementId, body) {
  const id = parseInt(String(connaissementId), 10);
  if (!Number.isFinite(id) || id < 1) throw new Error('INVALID_ID');

  const t = await sequelize.transaction();
  try {
    const doc = await Connaissement.findByPk(id, { transaction: t });
    if (!doc) {
      await t.rollback();
      throw new Error('NOT_FOUND');
    }

    const bd = body.bl_details || {};
    const ship = bd.shipper || {};
    const cons = bd.consignee || {};
    const vessel = bd.vessel_details || {};
    const route = bd.routing || {};
    const cargo = bd.cargo_summary || {};

    await doc.update(
      {
        blNumber: bd.bl_number != null ? String(bd.bl_number).slice(0, 20) : doc.blNumber,
        carrier: bd.carrier != null ? String(bd.carrier).slice(0, 100) : doc.carrier,
        shipperName: ship.name != null ? String(ship.name).slice(0, 255) : doc.shipperName,
        shipperAddress: ship.address != null ? String(ship.address) : doc.shipperAddress,
        consigneeName: cons.name != null ? String(cons.name).slice(0, 255) : doc.consigneeName,
        consigneeAddress: cons.address != null ? String(cons.address) : doc.consigneeAddress,
        vesselName:
          vessel.vessel_name != null ? String(vessel.vessel_name).slice(0, 100) : doc.vesselName,
        voyageNumber:
          vessel.voyage_number != null
            ? String(vessel.voyage_number).slice(0, 50)
            : doc.voyageNumber,
        portOfLoading:
          route.port_of_loading != null
            ? String(route.port_of_loading).slice(0, 100)
            : doc.portOfLoading,
        portOfDischarge:
          route.port_of_discharge != null
            ? String(route.port_of_discharge).slice(0, 100)
            : doc.portOfDischarge,
        placeOfDelivery:
          route.place_of_delivery != null
            ? String(route.place_of_delivery).slice(0, 100)
            : doc.placeOfDelivery,
        goodsDescription:
          cargo.goods_description !== undefined ? cargo.goods_description : doc.goodsDescription,
        totalPackages: cargo.total_packages !== undefined ? cargo.total_packages : doc.totalPackages,
        totalWeightKg:
          cargo.total_weight_kg !== undefined && cargo.total_weight_kg !== ''
            ? cargo.total_weight_kg
            : doc.totalWeightKg,
        totalMeasurementCbm:
          cargo.total_measurement_cbm !== undefined && cargo.total_measurement_cbm !== ''
            ? cargo.total_measurement_cbm
            : doc.totalMeasurementCbm,
        hsCodeIndicated:
          cargo.hs_code_indicated !== undefined ? cargo.hs_code_indicated : doc.hsCodeIndicated
      },
      { transaction: t }
    );

    const leg = body.legacy_connaissement;
    if (leg) {
      await doc.update(
        {
          numeroDossier:
            leg.numero_dossier !== undefined ? leg.numero_dossier ?? null : doc.numeroDossier,
          dateEmission:
            leg.date_emission !== undefined
              ? sanitizeDateOnly(leg.date_emission)
              : doc.dateEmission,
          validationFxi:
            leg.validation_fxi !== undefined ? leg.validation_fxi ?? null : doc.validationFxi,
          dateValidationFxi:
            leg.date_validation_fxi !== undefined
              ? sanitizeDateOnly(leg.date_validation_fxi)
              : doc.dateValidationFxi,
          controleParId:
            leg.controle_par_id !== undefined && leg.controle_par_id !== ''
              ? parseInt(String(leg.controle_par_id), 10) || null
              : doc.controleParId,
          controlePar:
            leg.controle_par !== undefined ? leg.controle_par ?? null : doc.controlePar,
          dateControle:
            leg.date_controle !== undefined
              ? sanitizeDateTime(leg.date_controle)
              : doc.dateControle,
          eta: leg.eta !== undefined ? sanitizeDateTime(leg.eta) : doc.eta
        },
        { transaction: t }
      );
    }

    const cd = body.customs_documents;
    if (cd) {
      await sequelize.query(
        `INSERT INTO documents_douaniers (connaissement_id, feri_number, feri_validation_date, bv_number)
         VALUES (:cid, :feri, :feri_d, :bv)
         ON DUPLICATE KEY UPDATE
           feri_number = VALUES(feri_number),
           feri_validation_date = VALUES(feri_validation_date),
           bv_number = VALUES(bv_number),
           updated_at = CURRENT_TIMESTAMP`,
        {
          replacements: {
            cid: id,
            feri: cd.feri_number || null,
            feri_d: sanitizeDateOnly(cd.feri_validation_date),
            bv: cd.bv_number || null
          },
          transaction: t
        }
      );
    }

    const ci = body.commercial_invoice;
    if (ci) {
      let factureId = null;
      const rawFid = ci.facture_id ?? ci.factureId;
      if (rawFid != null && String(rawFid).trim() !== '') {
        const parsed = parseInt(String(rawFid), 10);
        if (Number.isFinite(parsed) && parsed > 0) factureId = parsed;
      }
      if (!factureId) {
        factureId = await resolveFactureIdForConnaissement(id, ci, t);
      }

      if (factureId && ci.financials) {
        const fin = ci.financials;
        await sequelize.query(
          `UPDATE factures_commerciales SET
             invoice_number = COALESCE(:inv, invoice_number),
             invoice_date = COALESCE(:idate, invoice_date),
             contract_number = :contract,
             currency = COALESCE(:cur, currency),
             fob_value = :fob,
             ocean_freight = :freight,
             insurance = :ins,
             total_cip_value = :total,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = :fid`,
          {
            replacements: {
              fid: factureId,
              inv: ci.invoice_number || null,
              idate: sanitizeDateOnly(ci.date),
              contract: ci.contract_number ?? null,
              cur: fin.currency || null,
              fob: fin.fob_value ?? null,
              freight: fin.ocean_freight ?? null,
              ins: fin.insurance ?? null,
              total: fin.total_cip_value ?? null
            },
            transaction: t
          }
        );
      }

      const bank = ci.banking_info;
      if (bank && factureId) {
        const swift =
          bank.swift_code != null ? String(bank.swift_code).trim().slice(0, 20) || null : null;
        await sequelize.query(
          `INSERT INTO infos_bancaires (facture_id, beneficiary, bank_name, swift_code, account_number)
           VALUES (:fid, :ben, :bname, :swift, :acc)
           ON DUPLICATE KEY UPDATE
             beneficiary = VALUES(beneficiary),
             bank_name = VALUES(bank_name),
             swift_code = VALUES(swift_code),
             account_number = VALUES(account_number),
             updated_at = CURRENT_TIMESTAMP`,
          {
            replacements: {
              fid: factureId,
              ben: bank.beneficiary || '-',
              bname: bank.bank_name || '-',
              swift,
              acc: bank.account_number || null
            },
            transaction: t
          }
        );
      }

      if (Array.isArray(ci.items) && ci.items.length > 0) {
        if (!factureId) {
          factureId = await resolveFactureIdForConnaissement(id, ci, t);
        }
        if (!factureId) {
          throw new Error('FACTURE_REQUIRED_FOR_ITEMS');
        }
        await upsertCommercialInvoiceItems(factureId, ci.items, t);
      }
    }

    if (body.bl_details && Array.isArray(body.bl_details.containers)) {
      await sequelize.query(`DELETE FROM conteneurs WHERE connaissement_id = ?`, {
        replacements: [id],
        transaction: t
      });
      for (const co of body.bl_details.containers) {
        if (!co.container_number) continue;
        await sequelize.query(
          `INSERT INTO conteneurs (connaissement_id, container_number, seal_number, type, weight_kg, measurement_cbm)
           VALUES (:cid, :cn, :sn, :tp, :wk, :mcb)`,
          {
            replacements: {
              cid: id,
              cn: String(co.container_number).slice(0, 20),
              sn: co.seal_number ? String(co.seal_number).slice(0, 20) : null,
              tp: co.type ? String(co.type).slice(0, 10) : null,
              wk: co.weight_kg ?? null,
              mcb: co.measurement_cbm ?? null
            },
            transaction: t
          }
        );
      }
    }

    await t.commit();
    return loadFicheAsmDetail(id);
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

/**
 * Enregistre uniquement les lignes article (N° machine, châssis, moteur, etc.).
 */
async function saveCommercialInvoiceItems(connaissementId, items) {
  const id = parseInt(String(connaissementId), 10);
  if (!Number.isFinite(id) || id < 1) throw new Error('INVALID_ID');
  if (!Array.isArray(items) || items.length === 0) {
    return loadFicheAsmDetail(id);
  }

  const t = await sequelize.transaction();
  try {
    const factures = await sequelize.query(
      `SELECT id FROM factures_commerciales WHERE connaissement_id = ? ORDER BY id ASC LIMIT 1`,
      { replacements: [id], type: QueryTypes.SELECT, transaction: t }
    );
    let factureId = factures[0]?.id;
    if (!factureId) {
      factureId = await resolveFactureIdForConnaissement(id, { financials: { currency: 'USD' } }, t);
    }
    if (!factureId) {
      await t.rollback();
      throw new Error('FACTURE_REQUIRED_FOR_ITEMS');
    }
    await upsertCommercialInvoiceItems(factureId, items, t);
    await t.commit();
    return loadFicheAsmDetail(id);
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

module.exports = {
  loadFicheAsmDetail,
  loadUnifiedExtract,
  buildUnifiedExtractFromFicheDetail,
  saveFicheAsmDetail,
  ingestUnifiedExtract,
  upsertCommercialInvoiceItems,
  saveCommercialInvoiceItems
};
