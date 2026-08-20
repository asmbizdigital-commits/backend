/**
 * Sérialisation API pour l’UI héritée (champs façon ancien bl_documents + colonnes métier).
 */
function formatConnaissementForClient(row) {
  const j = typeof row?.toJSON === 'function' ? row.toJSON() : { ...row };

  const shipper = [j.shipperName, j.shipperAddress].filter(Boolean).join('\n');
  const consignee = [j.consigneeName, j.consigneeAddress].filter(Boolean).join('\n');

  let status = 'pending';
  if (j.isValidated) status = 'validated';
  else if (j.isDeclared) status = 'declared';
  else if (j.isExported) status = 'exported';

  const createdAt = j.createdAt ?? j.created_at;

  return {
    ...j,
    numero_dossier: j.numeroDossier ?? j.numero_dossier,
    shipper,
    consignee,
    blNumber: j.blNumber,
    vessel: j.vesselName,
    voyageNumber: j.voyageNumber,
    numeroVoyage: j.voyageNumber,
    voyage_number: j.voyageNumber,
    numero_voyage: j.voyageNumber,
    portLoading: j.portOfLoading,
    portDischarge: j.portOfDischarge,
    port_of_loading: j.portOfLoading,
    port_of_discharge: j.portOfDischarge,
    weight: j.totalWeightKg != null && j.totalWeightKg !== '' ? String(j.totalWeightKg) : '',
    volumeCbm: j.totalMeasurementCbm != null && j.totalMeasurementCbm !== '' ? String(j.totalMeasurementCbm) : '',
    volume_cbm:
      j.totalMeasurementCbm != null && j.totalMeasurementCbm !== '' ? String(j.totalMeasurementCbm) : '',
    marchandise: j.goodsDescription,
    goods_description: j.goodsDescription,
    codeHs: j.hsCodeIndicated,
    code_hs: j.hsCodeIndicated,
    codeImo: j.codeImo,
    code_imo: j.codeImo,
    totalPackages: j.totalPackages,
    total_packages: j.totalPackages,
    typeColis: j.typeColis,
    type_colis: j.typeColis,
    nombreColis: j.nombreColis,
    nombre_colis: j.nombreColis,
    paysOrigine: j.paysOrigine,
    pays_origine: j.paysOrigine,
    numeroFeri: j.numeroFeri,
    numero_feri: j.numeroFeri,
    numeroFxi: j.numeroFxi,
    numero_fxi: j.numeroFxi,
    validationFxi: j.validationFxi,
    validation_fxi: j.validationFxi,
    declarationNumber: j.declarationNumber,
    declaration_number: j.declarationNumber,
    controleParId: j.controleParId ?? j.controle_par_id ?? null,
    controle_par_id: j.controleParId ?? j.controle_par_id ?? null,
    controlePar: j.controlePar ?? j.controle_par ?? null,
    controle_par: j.controlePar ?? j.controle_par ?? null,
    status,
    fileName: j.fileName ?? null,
    fileHash: j.fileHash ?? null,
    bookingNumber: null,
    booking_number: null,
    rawText: null,
    createdAt,
    numeroDossier: j.numeroDossier,
    zoneConnaissement: j.zoneConnaissement ?? j.zone_connaissement ?? null,
    zone_connaissement: j.zoneConnaissement ?? j.zone_connaissement ?? null,
    directionConnaissement: j.directionConnaissement ?? j.direction_connaissement ?? null,
    direction_connaissement: j.directionConnaissement ?? j.direction_connaissement ?? null,
    bureauConnaissement: j.bureauConnaissement ?? j.bureau_connaissement ?? null,
    bureau_connaissement: j.bureauConnaissement ?? j.bureau_connaissement ?? null,
    zoneLabel: j.Zone?.nom ?? j.zoneNom ?? null,
    directionLabel: j.DirectionProvinciale?.nom ?? null,
    bureauLabel: j.BureauInternational?.nom ?? null,
    /** nom de table métier pour le front */
    _sourceTable: 'connaissements'
  };
}

module.exports = { formatConnaissementForClient };
