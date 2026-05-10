/**
 * Fiche ASM unifiée : connaissements + conteneurs + documents_douaniers +
 * factures_commerciales + infos_bancaires + articles_facture + articles_attributes.
 */
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const Connaissement = require('../models/Connaissement');

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
      item[a.attribute_name] = a.attribute_value;
    }
    items.push(item);
  }
  return items;
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
            leg.date_emission !== undefined ? leg.date_emission ?? null : doc.dateEmission,
          validationFxi:
            leg.validation_fxi !== undefined ? leg.validation_fxi ?? null : doc.validationFxi,
          dateValidationFxi:
            leg.date_validation_fxi !== undefined
              ? leg.date_validation_fxi ?? null
              : doc.dateValidationFxi,
          controleParId:
            leg.controle_par_id !== undefined && leg.controle_par_id !== ''
              ? parseInt(String(leg.controle_par_id), 10) || null
              : doc.controleParId,
          controlePar:
            leg.controle_par !== undefined ? leg.controle_par ?? null : doc.controlePar,
          dateControle:
            leg.date_controle !== undefined ? leg.date_controle ?? null : doc.dateControle,
          eta: leg.eta !== undefined ? leg.eta ?? null : doc.eta
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
            feri_d: cd.feri_validation_date || null,
            bv: cd.bv_number || null
          },
          transaction: t
        }
      );
    }

    const ci = body.commercial_invoice;
    if (ci && ci.financials) {
      const fin = ci.financials;
      const existing = await sequelize.query(
        `SELECT id FROM factures_commerciales WHERE connaissement_id = ? ORDER BY id ASC LIMIT 1`,
        { replacements: [id], type: QueryTypes.SELECT, transaction: t }
      );
      let factureId = existing[0]?.id;

      if (!factureId) {
        const invNum =
          ci.invoice_number || `AUTO-${id}-${Date.now()}`.slice(0, 50);
        const [, meta] = await sequelize.query(
          `INSERT INTO factures_commerciales
           (connaissement_id, invoice_number, invoice_date, contract_number, currency, fob_value, ocean_freight, insurance, total_cip_value)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          {
            replacements: [
              id,
              String(invNum).slice(0, 50),
              ci.date || new Date().toISOString().slice(0, 10),
              ci.contract_number || null,
              fin.currency || 'USD',
              fin.fob_value ?? null,
              fin.ocean_freight ?? null,
              fin.insurance ?? null,
              fin.total_cip_value ?? null
            ],
            transaction: t
          }
        );
        factureId = meta?.insertId;
        if (!factureId) {
          const rid = await sequelize.query(
            `SELECT id FROM factures_commerciales WHERE connaissement_id = ? ORDER BY id DESC LIMIT 1`,
            { replacements: [id], type: QueryTypes.SELECT, transaction: t }
          );
          factureId = rid[0]?.id;
        }
      } else {
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
              idate: ci.date || null,
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
              swift: bank.swift_code || null,
              acc: bank.account_number || null
            },
            transaction: t
          }
        );
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

module.exports = {
  loadFicheAsmDetail,
  saveFicheAsmDetail
};
