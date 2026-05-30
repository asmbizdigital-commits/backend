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
  { key: 'nom_usage', label: "Nom d'usage", required: false, example: '' },
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
  { key: 'departement_id', label: 'ID département (voir Referentiel)', required: true, example: '1' },
  { key: 'sous_departement_id', label: 'ID sous-département', required: false, example: '' },
  { key: 'date_embauche', label: 'Date embauche (AAAA-MM-JJ)', required: true, example: '2026-01-01' },
  { key: 'type_contrat', label: 'Type contrat', required: true, example: 'CDI' },
  { key: 'temps_travail', label: 'Temps travail', required: true, example: 'Temps plein' },
  { key: 'statut', label: 'Statut', required: false, example: 'Actif' },
  { key: 'matricule', label: 'Matricule', required: false, example: 'EMP-001' }
];

const KNOWN_KEYS = new Set(TEMPLATE_COLUMNS.map((c) => c.key));

const HEADER_ALIASES = {
  civilite: 'civilite',
  nom_famille: 'nom_famille',
  nom: 'nom_famille',
  'nom de famille': 'nom_famille',
  nom_usage: 'nom_usage',
  "nom d'usage": 'nom_usage',
  prenoms: 'prenoms',
  prenom: 'prenoms',
  date_naissance: 'date_naissance',
  'date naissance': 'date_naissance',
  'date de naissance': 'date_naissance',
  lieu_naissance: 'lieu_naissance',
  'lieu de naissance': 'lieu_naissance',
  nationalite: 'nationalite',
  adresse: 'adresse',
  code_postal: 'code_postal',
  'code postal': 'code_postal',
  ville: 'ville',
  pays: 'pays',
  telephone_personnel: 'telephone_personnel',
  'telephone personnel': 'telephone_personnel',
  telephone: 'telephone_personnel',
  tel: 'telephone_personnel',
  mobile: 'telephone_personnel',
  gsm: 'telephone_personnel',
  email_personnel: 'email_personnel',
  'email personnel': 'email_personnel',
  email: 'email_personnel',
  'e-mail': 'email_personnel',
  mail: 'email_personnel',
  courriel: 'email_personnel',
  'adresse email': 'email_personnel',
  'adresse e-mail': 'email_personnel',
  poste: 'poste',
  fonction: 'poste',
  departement_id: 'departement_id',
  'id departement': 'departement_id',
  'departement id': 'departement_id',
  departement: 'departement_id',
  sous_departement_id: 'sous_departement_id',
  date_embauche: 'date_embauche',
  'date embauche': 'date_embauche',
  type_contrat: 'type_contrat',
  'type contrat': 'type_contrat',
  'type de contrat': 'type_contrat',
  temps_travail: 'temps_travail',
  'temps travail': 'temps_travail',
  'temps de travail': 'temps_travail',
  statut: 'statut',
  matricule: 'matricule'
};

function normalizeHeader(h) {
  if (h == null) return '';
  return String(h)
    .trim()
    .replace(/\*+/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapHeaderToKey(header) {
  const n = normalizeHeader(header);
  if (!n) return null;
  if (HEADER_ALIASES[n]) return HEADER_ALIASES[n];
  if (KNOWN_KEYS.has(n.replace(/ /g, '_'))) return n.replace(/ /g, '_');

  if (/\b(email|e-mail|mail|courriel)\b/.test(n) || n.includes('email') || n.includes('mail')) {
    return 'email_personnel';
  }
  if (/\b(tel|telephone|mobile|gsm|phone)\b/.test(n)) {
    return 'telephone_personnel';
  }
  if (n.includes('departement') && n.includes('sous')) return 'sous_departement_id';
  if (n.includes('departement') || n.includes('service')) return 'departement_id';
  if (n.includes('naissance') && n.includes('date')) return 'date_naissance';
  if (n.includes('naissance') && !n.includes('date')) return 'lieu_naissance';
  if (n.includes('embauche')) return 'date_embauche';
  if (n.includes('contrat')) return 'type_contrat';

  return n.replace(/ /g, '_');
}

function cellToString(val) {
  if (val == null || val === '') return '';
  if (typeof val === 'number') {
    if (val > 1e10) return String(Math.trunc(val));
    if (Number.isInteger(val)) return String(val);
    return String(val);
  }
  return String(val).trim();
}

function normalizeEmail(val) {
  let s = cellToString(val).toLowerCase();
  if (!s) return '';
  s = s.replace(/^mailto:/i, '');
  s = s.replace(/\s+/g, '');
  s = s.replace(/[,;]+$/, '');
  return s;
}

function normalizePhone(val) {
  const s = cellToString(val);
  if (!s) return '';
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(s)) {
    return String(Math.trunc(Number(s)));
  }
  return s.replace(/\s+/g, ' ').trim();
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

function detectHeaderRowIndex(sheet) {
  const ref = sheet['!ref'];
  if (!ref) return 0;
  const range = XLSX.utils.decode_range(ref);
  let bestRow = range.s.r;
  let bestScore = 0;

  for (let r = range.s.r; r <= Math.min(range.s.r + 8, range.e.r); r++) {
    let score = 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      const key = mapHeaderToKey(cell?.v);
      if (key && KNOWN_KEYS.has(key)) score += 1;
      else if (key === 'email_personnel' || key === 'telephone_personnel') score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestRow = r;
    }
  }
  return bestRow;
}

function enrichFromRowValues(out, raw) {
  for (const value of Object.values(raw)) {
    const s = cellToString(value);
    if (!s) continue;
    if (!out.email_personnel) {
      const mail = normalizeEmail(s);
      if (mail.includes('@') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
        out.email_personnel = mail;
      }
    }
    if (!out.telephone_personnel && /^[\d\s+().-]{8,}$/.test(s) && !s.includes('@')) {
      out.telephone_personnel = normalizePhone(s);
    }
  }
}

function isInstructionOrExampleRow(data) {
  const nom = String(data.nom_famille || '');
  const mail = String(data.email_personnel || '');
  if (/nom de famille/i.test(nom)) return true;
  if (/civilite|prénoms|email personnel|téléphone/i.test(nom)) return true;
  if (/dupont/i.test(nom) && /exemple/i.test(mail)) return true;
  if (/jean\.dupont@exemple/i.test(mail)) return true;
  if (String(data.civilite || '').includes('*')) return true;
  if (/^m\.?$/i.test(String(data.civilite || '')) && /dupont/i.test(nom)) return true;
  return false;
}

function isSparseRow(data) {
  const filled = REQUIRED_FIELDS.filter((f) => {
    const v = data[f];
    return v != null && v !== '';
  }).length;
  return filled < 4;
}

function rowToEmployee(raw, excelRowNumber) {
  const out = { statut: 'Actif' };
  for (const [header, value] of Object.entries(raw)) {
    const key = mapHeaderToKey(header);
    if (!key || value === '' || value == null) continue;

    if (key === 'date_naissance' || key === 'date_embauche' || key === 'date_fin_contrat') {
      out[key] = cellToDateString(value);
    } else if (key === 'departement_id' || key === 'sous_departement_id') {
      const n = parseInt(String(value).trim(), 10);
      out[key] = Number.isNaN(n) ? null : n;
    } else if (key === 'email_personnel') {
      out[key] = normalizeEmail(value);
    } else if (key === 'telephone_personnel') {
      out[key] = normalizePhone(value);
    } else {
      out[key] = cellToString(value);
    }
  }

  enrichFromRowValues(out, raw);
  return { data: out, rowIndex: excelRowNumber };
}

function validateRow(employee, rowIndex) {
  const missing = REQUIRED_FIELDS.filter((f) => {
    const v = employee[f];
    return v == null || v === '';
  });
  if (missing.length) {
    const labels = {
      email_personnel: 'Email personnel',
      telephone_personnel: 'Téléphone personnel',
      nom_famille: 'Nom',
      prenoms: 'Prénoms',
      departement_id: 'ID département'
    };
    const fr = missing.map((m) => labels[m] || m).join(', ');
    return `Ligne ${rowIndex} : champs manquants ou non reconnus (${fr}). Vérifiez les en-têtes de colonnes.`;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(employee.email_personnel)) {
    const preview = employee.email_personnel ? `"${employee.email_personnel}"` : '(vide)';
    return `Ligne ${rowIndex} : email invalide ${preview}`;
  }
  if (!employee.departement_id) {
    return `Ligne ${rowIndex} : ID département invalide`;
  }
  return null;
}

function parseWorkbookBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames.find((n) => /^employ/i.test(n)) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const headerRow = detectHeaderRowIndex(sheet);
  const rows = XLSX.utils.sheet_to_json(sheet, {
    range: headerRow,
    defval: '',
    raw: false
  });

  return rows.map((row, i) => rowToEmployee(row, headerRow + i + 2));
}

function buildTemplateBuffer(departements = []) {
  const headerRow = TEMPLATE_COLUMNS.map((c) => c.key);
  const exampleRow = TEMPLATE_COLUMNS.map((c) => c.example);
  const noteRow = TEMPLATE_COLUMNS.map((c, i) =>
    i === 0 ? 'Ligne exemple — ne pas modifier, saisir à partir de la ligne 3' : ''
  );
  const ws = XLSX.utils.aoa_to_sheet([headerRow, noteRow, exampleRow]);
  ws['!cols'] = TEMPLATE_COLUMNS.map(() => ({ wch: 24 }));

  const refRows = [['id', 'nom', 'code'], ...departements.map((d) => [d.id, d.nom || '', d.code || ''])];
  const wsRef = XLSX.utils.aoa_to_sheet(refRows);
  wsRef['!cols'] = [{ wch: 8 }, { wch: 32 }, { wch: 12 }];

  const instructions = [
    ['Import employés — mode d\'emploi'],
    [''],
    ['1. Ne supprimez pas la ligne 1 (noms techniques des colonnes).'],
    ['2. Remplissez vos employés à partir de la ligne 3 (ligne 2 = exemple).'],
    ['3. Colonnes obligatoires : toutes sauf nom_usage, sous_departement_id, statut, matricule.'],
    ['4. departement_id : voir la feuille Referentiel_Departements.'],
    ['5. Dates au format AAAA-MM-JJ ou JJ/MM/AAAA.'],
    ['6. Email : une adresse valide par ligne (ex. prenom.nom@entreprise.com).']
  ];
  const wsHelp = XLSX.utils.aoa_to_sheet(instructions);
  wsHelp['!cols'] = [{ wch: 70 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Employes');
  XLSX.utils.book_append_sheet(wb, wsRef, 'Referentiel_Departements');
  XLSX.utils.book_append_sheet(wb, wsHelp, 'Instructions');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  REQUIRED_FIELDS,
  TEMPLATE_COLUMNS,
  parseWorkbookBuffer,
  validateRow,
  buildTemplateBuffer,
  cellToDateString,
  isInstructionOrExampleRow,
  isSparseRow,
  normalizeEmail,
  normalizePhone,
  mapHeaderToKey
};
