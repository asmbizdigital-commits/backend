const { Op } = require('sequelize');
const Connaissement = require('../models/Connaissement');
const AssignationBL = require('../models/AssignationBL');
const AssignationBLControleur = require('../models/AssignationBLControleur');
const User = require('../models/User');
const TaskPro = require('../models/TaskPro');
const DocsFeri = require('../models/DocsFeri');
const DocsZip = require('../models/DocsZip');
const DocsControleBl = require('../models/DocsControleBl');
const DossierActivityLog = require('../models/DossierActivityLog');
const Zone = require('../models/Zone');
const DirectionProvinciale = require('../models/DirectionProvinciale');
const BureauInternational = require('../models/BureauInternational');
const { formatConnaissementForClient } = require('../utils/connaissementApiFormat');
const { ACTION_LABELS_FR, scoreFromDuration } = require('../utils/dossierActivityLog');
const { loadFicheAsmDetail } = require('./connaissementFicheAsmService');

const ASSIGN_INCLUDES = [
  { model: User, as: 'assignee', attributes: ['id', 'nom', 'prenom', 'role', 'email'] },
  { model: User, as: 'assignePar', attributes: ['id', 'nom', 'prenom', 'role', 'email'] },
  { model: TaskPro, as: 'taskPro', attributes: ['id', 'numero_tache', 'titre', 'statut', 'priorite', 'date_creation'] }
];

function toPlain(row) {
  if (!row) return null;
  return typeof row.toJSON === 'function' ? row.toJSON() : row;
}

function buildCircuitSteps(doc) {
  const hasNumero = Boolean(String(doc.numeroDossier ?? doc.numero_dossier ?? '').trim());
  const steps = [
    {
      id: 'bl-extracteur',
      key: 'bl-extracteur',
      done: hasNumero,
      active: !hasNumero
    },
    {
      id: 'saisi-dossier',
      key: 'saisi-dossier',
      done: Boolean(doc.isExported),
      active: hasNumero && !doc.isExported
    },
    {
      id: 'controle-conformite',
      key: 'controle-conformite',
      done: Boolean(doc.isDeclared),
      active: hasNumero && doc.isExported && !doc.isDeclared
    },
    {
      id: 'cloture-controle',
      key: 'cloture-controle',
      done: Boolean(doc.isValidated),
      active: hasNumero && doc.isDeclared && !doc.isValidated
    },
    {
      id: 'controle-dossiers',
      key: 'controle-dossiers',
      done: Boolean(doc.isControlledByController),
      active: hasNumero && doc.isValidated && !doc.isControlledByController
    }
  ];

  let currentIndex = steps.findIndex((s) => s.active);
  if (currentIndex < 0) {
    currentIndex = steps.every((s) => s.done) ? steps.length - 1 : 0;
  }

  return {
    steps: steps.map(({ id, key, done }) => ({ id, key, done })),
    currentIndex,
    currentStepId: steps[currentIndex]?.id ?? null
  };
}

function formatActivityRow(row) {
  const plain = toPlain(row);
  if (!plain) return null;
  return {
    ...plain,
    actionLabel: ACTION_LABELS_FR[plain.actionType] || plain.actionType,
    score: scoreFromDuration(plain.actionType, plain.durationMs)
  };
}

function formatDocsFeri(doc) {
  const plain = toPlain(doc);
  if (!plain) return null;
  return {
    id: plain.id,
    file_url: plain.fileUrl ?? plain.file_url,
    original_filename: plain.originalFilename ?? plain.original_filename,
    created_at: plain.createdAt ?? plain.created_at
  };
}

function formatDocsZip(doc) {
  const plain = toPlain(doc);
  if (!plain) return null;
  return {
    id: plain.id,
    file_url: plain.fileUrl ?? plain.file_url,
    original_filename: plain.originalFilename ?? plain.original_filename,
    created_at: plain.createdAt ?? plain.created_at
  };
}

function formatDocsControle(doc) {
  const plain = toPlain(doc);
  if (!plain) return null;
  return {
    id: plain.id,
    file_url: plain.fileUrl ?? plain.file_url,
    original_filename: plain.originalFilename ?? plain.original_filename,
    mime_type: plain.mimeType ?? plain.mime_type,
    uploaded_by: plain.uploadedBy ?? plain.uploaded_by,
    created_at: plain.createdAt ?? plain.created_at
  };
}

async function searchTrackingDossiers(queryRaw, { limit = 25 } = {}) {
  const q = String(queryRaw || '').trim();
  if (!q) return [];

  const like = `%${q}%`;
  const rows = await Connaissement.findAll({
    where: {
      [Op.or]: [
        { numeroDossier: { [Op.like]: like } },
        { blNumber: { [Op.like]: like } },
        { declarationNumber: { [Op.like]: like } }
      ]
    },
    attributes: [
      'id',
      'blNumber',
      'numeroDossier',
      'declarationNumber',
      'vesselName',
      'consigneeName',
      'isExported',
      'isDeclared',
      'isValidated',
      'isControlledByController',
      'updatedAt',
      'createdAt'
    ],
    order: [['updatedAt', 'DESC']],
    limit: Math.min(50, Math.max(1, limit))
  });

  return rows.map((row) => {
    const plain = toPlain(row);
    const circuit = buildCircuitSteps(plain);
    return {
      id: plain.id,
      blNumber: plain.blNumber,
      numeroDossier: plain.numeroDossier,
      declarationNumber: plain.declarationNumber,
      vesselName: plain.vesselName,
      consigneeName: plain.consigneeName,
      updatedAt: plain.updatedAt,
      createdAt: plain.createdAt,
      currentStepId: circuit.currentStepId
    };
  });
}

async function loadTrackingDossierById(idRaw) {
  const id = parseInt(String(idRaw), 10);
  if (!Number.isFinite(id) || id < 1) return null;

  const row = await Connaissement.findByPk(id, {
    include: [
      { model: Zone, as: 'Zone', attributes: ['id', 'nom', 'code'] },
      { model: DirectionProvinciale, as: 'DirectionProvinciale', attributes: ['id', 'nom', 'code'] },
      { model: BureauInternational, as: 'BureauInternational', attributes: ['id', 'nom', 'code', 'ville', 'pays'] }
    ]
  });
  if (!row) return null;

  const [
    assignationsSaisi,
    assignationsControleur,
    docFeri,
    docZip,
    docsControle,
    activityLog,
    ficheDetail,
    controleParUser,
    supportClientUser
  ] = await Promise.all([
    AssignationBL.findAll({
      where: { connaissementId: id },
      include: ASSIGN_INCLUDES,
      order: [['created_at', 'DESC']]
    }),
    AssignationBLControleur.findAll({
      where: { connaissementId: id },
      include: ASSIGN_INCLUDES,
      order: [['created_at', 'DESC']]
    }),
    DocsFeri.findOne({ where: { docConnaissementId: id } }),
    DocsZip.findOne({ where: { docConnaissementId: id } }),
    DocsControleBl.findAll({ where: { connaissementId: id }, order: [['created_at', 'DESC']] }),
    DossierActivityLog.findAll({ where: { connaissementId: id }, order: [['created_at', 'ASC'], ['id', 'ASC']] }),
    loadFicheAsmDetail(id),
    row.controleParId
      ? User.findByPk(row.controleParId, { attributes: ['id', 'nom', 'prenom', 'role', 'email'] })
      : null,
    row.idSupportClient
      ? User.findByPk(row.idSupportClient, { attributes: ['id', 'nom', 'prenom', 'role', 'email'] })
      : null
  ]);

  const connaissement = formatConnaissementForClient(row);
  if (ficheDetail?.customs_documents?.bv_number) {
    connaissement.bvNumber = ficheDetail.customs_documents.bv_number;
    connaissement.bv_number = ficheDetail.customs_documents.bv_number;
  }

  const latestSaisi = assignationsSaisi.find((a) => a.statut !== 'Annulée') || assignationsSaisi[0];
  const latestControle =
    assignationsControleur.find((a) => a.statut !== 'Annulée') || assignationsControleur[0];

  const toAssignee = (ass) => {
    const a = toPlain(ass);
    if (!a?.assignee) return null;
    return {
      id: a.assignee.id,
      prenom: a.assignee.prenom,
      nom: a.assignee.nom,
      role: a.assignee.role
    };
  };

  connaissement.saisiAssignee = toAssignee(latestSaisi);
  connaissement.controleAssignee = toAssignee(latestControle);
  connaissement.controlePriorite = latestControle?.priorite ?? null;
  connaissement.saisiPriorite = latestSaisi?.priorite ?? null;

  if (supportClientUser) {
    connaissement.supportClientAssignee = toPlain(supportClientUser);
  } else if (connaissement.nomSupportClient) {
    connaissement.supportClientAssignee = {
      id: connaissement.idSupportClient,
      prenom: '',
      nom: connaissement.nomSupportClient,
      role: 'call_center'
    };
  }

  return {
    connaissement,
    circuit: buildCircuitSteps(connaissement),
    assignations: {
      saisi: assignationsSaisi.map(toPlain),
      controleur: assignationsControleur.map(toPlain)
    },
    documents: {
      feri: formatDocsFeri(docFeri),
      zip: formatDocsZip(docZip),
      controle: docsControle.map(formatDocsControle).filter(Boolean)
    },
    activityLog: activityLog.map(formatActivityRow).filter(Boolean),
    fiche: ficheDetail,
    controleParUser: toPlain(controleParUser),
    tables: ficheDetail?._tables ?? null
  };
}

module.exports = {
  searchTrackingDossiers,
  loadTrackingDossierById,
  buildCircuitSteps
};
