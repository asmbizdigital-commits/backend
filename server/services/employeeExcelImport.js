const XLSX = require('xlsx');

const REQUIRED_FIELDS = [
  'civilite',
  'nom_famille',
  'prenoms',
  'date_naissance',
  'lieu_naissance',
  'nationalite',
  'adresse',
  'code_postal',
  'ville',
  'pays',
  'telephone_personnel',
  'email_personnel',
  'poste',
  'departement_id',
  'date_embauche',
  'type_contrat',
  'temps_travail'
];

const TEMPLATE_COLUMNS = [
  { key: 'civilite', label: 'Civilité', required: true, example: 'M.' },
  { key: 'nom_famille', label: 'Nom de famille', required: true, example: 'Dupont' },
  { key: 'nom_usage', label: 'Nom d\'usage', required: false, example: '' },
  { key: 'prenoms', label: 'Prénoms', required: true, example: 'Jean' },
  { key: 'date_naissance', label: 'Date naissance (AAAA-MM-JJ)', required: true, example: '1990-05-15' },
  { key: 'lieu_naissance', label: 'Lieu de naissance', required: true, example: 'Kinshasa' },
  { key: 'nationalite', label: 'Nationalité', required: true, example: 'Congolaise' },
  { key: 'adresse', label: 'Adresse', required: true, example: '12 av. Example' },
  { key: 'code_postal', label: 'Code postal', required: true, example: '00000' },
  { key: 'ville', label: 'Ville', required: true, example: 'Kinshasa' },
  { key: 'pays', label: 'Pays', required: true, example: 'RDC' },
  { key: 'telephone_personnel', label: 'Téléphone personnel', required: true, example: '+243900000000' },
  { key: 'email_personnel', label: 'Email personnel', required: true, example: 'jean.dupont@exemple.com' },
  { key: 'poste', label: 'Poste', required: true, example: 'Comptable' },
  { key: 'departement_id', label: 'ID département (voir feuille Referentiel)', required: true, example: '1' },
  { key: 'sous_departement_id', label: 'ID sous-département', required: false, example: '' },
  { key: 'date_embauche', label: 'Date embauche (AAAA-MM-JJ)', required: true, example: '2026-01-01' },
  { key: 'type_contrat', label: 'Type contrat (CDI, CDD, …)', required: true, example: 'CDI' },
  { key: 'temps_travail', label: 'Temps travail', required: true, example: 'Temps plein' },
  { key: 'statut', label: 'Statut', required: false, example: 'Actif' },
  { key: 'matricule', label: 'Matricule', required: false, example: 'EMP-001' }
];

const HEADER_ALIASES = {
  civilite: 'civilite',
  'civilité': 'civilite',
  nom_famille: 'nom_famille',
  nom: 'nom_famille',
  'nom de famille': 'nom_famille',
  nom_usage: 'nom_usage',
  "nom d'usage": 'nom_usage',
  prenoms: 'prenoms',
  'prénoms': 'prenoms',
  date_naissance: 'date_naissance',
  'date naissance': 'date_naissance',
  lieu_naissance: 'lieu_naissance',
  'lieu de naissance': 'lieu_naissance',
  nationalite: 'nationalite',
  nationalité: 'nationalite',
  adresse: 'adresse',
  code_postal: 'code_postal',
  'code postal': 'code_postal',
  ville: 'ville',
  pays: 'pays',
  telephone_personnel: 'telephone_personnel',
  'téléphone personnel': 'telephone_personnel',
  telephone: 'telephone_personnel',
  email_personnel: 'email_personnel',
  email: 'email_personnel',
  poste: 'poste',
  departement_id: 'departement_id',
  'id département': 'departement_id',
  'departement id': 'departement_id',
  sous_departement_id: 'sous_departement_id',
  date_embauche: 'date_embauche',
  'date embauche': 'date_embauche',
  type_contrat: 'type_contrat',
  'type contrat': 'type_contrat',
  temps_travail: 'temps_travail',
  'temps travail': 'temps_travail',
  statut: 'statut',
  matricule: 'matricule'
};

function normalizeHeader(h) {
  if (h == null) return '';
  return String(h)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function mapHeaderToKey(header) {
  const n = normalizeHeader(header);
  if (HEADER_ALIASES[n]) return HEADER_ALIASES[n];
  if (TEMPLATE_COLUMNS.some((c) => c.key === n)) return n;
  return n.replace(/ /g, '_');
}

function cellToDateString(val) {
  if (val == null || val === '') return null;
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  if (typeof val === 'number') {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed) {
      const m = String(parsed.m).padStart(2, '0');
      const d = String(parsed.d).padStart(2, '0');
      return `${parsed.y}-${m}-${d}`;
    }
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const fr = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (fr) {
    return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
  }
  return s;
}

function isInstructionOrExampleRow(data) {
  const nom = String(data.nom_famille || '');
  const mail = String(data.email_personnel || '');
  if (/nom de famille/i.test(nom) || /dupont/i.test(nom) && /exemple/i.test(mail)) return true;
  if (/jean\.dupont@exemple/i.test(mail)) return true;
  if (String(data.civilite || '').includes('*')) return true;
  return false;
}

function rowToEmployee(raw, rowIndex) {
  const out = { statut: 'Actif' };
  for (const [header, value] of Object.entries(raw)) {
    const key = mapHeaderToKey(header);
    if (!key || value === '' || value == null) continue;
    if (key === 'date_naissance' || key === 'date_embauche' || key === 'date_fin_contrat') {
      out[key] = cellToDateString(value);
    } else if (key === 'departement_id' || key === 'sous_departement_id') {
      const n = parseInt(String(value).trim(), 10);
      out[key] = Number.isNaN(n) ? null : n;
    } else {
      out[key] = String(value).trim();
    }
  }
  return { data: out, rowIndex };
}

function validateRow(employee, rowIndex) {
  const missing = REQUIRED_FIELDS.filter((f) => !employee[f]);
  if (missing.length) {
    return `Ligne ${rowIndex} : champs obligatoires manquants (${missing.join(', ')})`;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(employee.email_personnel)) {
    return `Ligne ${rowIndex} : email invalide`;
  }
  if (!employee.departement_id) {
    return `Ligne ${rowIndex} : departement_id invalide`;
  }
  return null;
}

function parseWorkbookBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames.find((n) => /^employ/i.test(n)) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  return rows.map((row, i) => rowToEmployee(row, i + 2));
}

function buildTemplateBuffer(departements = []) {
  const headerRow = TEMPLATE_COLUMNS.map((c) => c.key);
  const labelRow = TEMPLATE_COLUMNS.map((c) => `${c.label}${c.required ? ' *' : ''}`);
  const exampleRow = TEMPLATE_COLUMNS.map((c) => c.example);
  const ws = XLSX.utils.aoa_to_sheet([headerRow, labelRow, exampleRow]);
  ws['!cols'] = TEMPLATE_COLUMNS.map(() => ({ wch: 22 }));

  const refRows = [['id', 'nom', 'code'], ...departements.map((d) => [d.id, d.nom || '', d.code || ''])];
  const wsRef = XLSX.utils.aoa_to_sheet(refRows);
  wsRef['!cols'] = [{ wch: 8 }, { wch: 32 }, { wch: 12 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Employes');
  XLSX.utils.book_append_sheet(wb, wsRef, 'Referentiel_Departements');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  REQUIRED_FIELDS,
  TEMPLATE_COLUMNS,
  parseWorkbookBuffer,
  validateRow,
  buildTemplateBuffer,
  cellToDateString,
  isInstructionOrExampleRow
};
