/**
 * Registre des modules (menus) → réinitialisation atomique des tables associées.
 * Chaque handler reçoit { sequelize, transaction, options }.
 */

const { Op } = require('sequelize');

async function deleteAll(Model, transaction) {
  await Model.destroy({ where: {}, transaction, force: true });
}

async function nullifyDepartementRefs(sequelize, transaction) {
  const q = (sql) => sequelize.query(sql, { transaction });
  await q('UPDATE tbl_utilisateurs SET departement_id = NULL, sous_departement_id = NULL');
  await q('UPDATE tbl_employes SET departement_id = NULL, sous_departement_id = NULL');
  try {
    await q('UPDATE tbl_plaintes SET departement_id = NULL, sous_departement_id = NULL');
  } catch (_) {
    /* colonnes optionnelles */
  }
  try {
    await q('UPDATE tbl_task_pro SET departement_id = NULL, sous_departement_id = NULL');
  } catch (_) {}
}

const MODULE_RESET_REGISTRY = {
  departements: {
    label: 'Départements',
    description: 'Vide tbl_sous_departements puis tbl_departements (références neutralisées).',
    async run(ctx) {
      const { sequelize, transaction } = ctx;
      await nullifyDepartementRefs(sequelize, transaction);
      const SousDepartement = require('../models/SousDepartement');
      const Departement = require('../models/Departement');
      await deleteAll(SousDepartement, transaction);
      await deleteAll(Departement, transaction);
    }
  },

  sous_departements: {
    label: 'Sous-départements',
    description: 'Vide uniquement tbl_sous_departements.',
    async run(ctx) {
      const { sequelize, transaction } = ctx;
      await sequelize.query(
        'UPDATE tbl_utilisateurs SET sous_departement_id = NULL',
        { transaction }
      );
      await sequelize.query(
        'UPDATE tbl_employes SET sous_departement_id = NULL',
        { transaction }
      );
      const SousDepartement = require('../models/SousDepartement');
      await deleteAll(SousDepartement, transaction);
    }
  },

  directions_provinciales: {
    label: 'Directions provinciales',
    async run(ctx) {
      const DirectionProvinciale = require('../models/DirectionProvinciale');
      await deleteAll(DirectionProvinciale, ctx.transaction);
    }
  },

  bureaux_internationaux: {
    label: 'Bureaux internationaux',
    async run(ctx) {
      const BureauInternational = require('../models/BureauInternational');
      await deleteAll(BureauInternational, ctx.transaction);
    }
  },

  exploitation: {
    label: 'Exploitation (FERI / B/L)',
    description: 'Assignations B/L, contrôleurs et connaissements.',
    async run(ctx) {
      const { transaction } = ctx;
      const AssignationBL = require('../models/AssignationBL');
      const AssignationBLControleur = require('../models/AssignationBLControleur');
      const Connaissement = require('../models/Connaissement');
      await deleteAll(AssignationBL, transaction);
      await deleteAll(AssignationBLControleur, transaction);
      await deleteAll(Connaissement, transaction);
    }
  },

  rh_employes: {
    label: 'Employés (RH)',
    description: 'Données RH liées aux employés puis tbl_employes.',
    async run(ctx) {
      const { sequelize, transaction } = ctx;
      const tables = [
        'tbl_dependants',
        'tbl_sanctions_pro',
        'tbl_sanctions',
        'tbl_gratifications',
        'tbl_employe_utilisateur',
        'tbl_demandes_conges',
        'tbl_absences',
        'tbl_pointages',
        'tbl_paiements_salaires',
        'tbl_organigramme',
        'tbl_employes'
      ];
      for (const table of tables) {
        try {
          await sequelize.query(`DELETE FROM \`${table}\``, { transaction });
        } catch (err) {
          if (err.original?.code !== 'ER_NO_SUCH_TABLE') throw err;
        }
      }
    }
  },

  rh_sanctions: {
    label: 'Sanctions (RH)',
    async run(ctx) {
      const SanctionPro = require('../models/SanctionPro');
      const Sanction = require('../models/Sanction');
      await deleteAll(SanctionPro, ctx.transaction);
      await deleteAll(Sanction, ctx.transaction);
    }
  },

  rh_conges: {
    label: 'Congés & absences',
    async run(ctx) {
      const DemandeConge = require('../models/DemandeConge');
      const Absence = require('../models/Absence');
      await deleteAll(DemandeConge, ctx.transaction);
      await deleteAll(Absence, ctx.transaction);
    }
  },

  rh_pointages: {
    label: 'Temps & présences',
    async run(ctx) {
      const Pointage = require('../models/Pointage');
      await deleteAll(Pointage, ctx.transaction);
    }
  },

  finances_comptabilite: {
    label: 'Comptabilité (écritures & plan)',
    async run(ctx) {
      const { transaction } = ctx;
      const LigneEcritureFin = require('../models/LigneEcritureFin');
      const EcritureFin = require('../models/EcritureFin');
      const LigneFactureFin = require('../models/LigneFactureFin');
      const FactureFin = require('../models/FactureFin');
      const LigneBudgetFin = require('../models/LigneBudgetFin');
      const BudgetFin = require('../models/BudgetFin');
      const CompteFin = require('../models/CompteFin');
      const JournalFin = require('../models/JournalFin');
      await deleteAll(LigneEcritureFin, transaction);
      await deleteAll(EcritureFin, transaction);
      await deleteAll(LigneFactureFin, transaction);
      await deleteAll(FactureFin, transaction);
      await deleteAll(LigneBudgetFin, transaction);
      await deleteAll(BudgetFin, transaction);
      await deleteAll(CompteFin, transaction);
      await deleteAll(JournalFin, transaction);
    }
  },

  finances_caisses: {
    label: 'Caisses',
    async run(ctx) {
      const Caisse = require('../models/Caisse');
      await deleteAll(Caisse, ctx.transaction);
    }
  },

  demandes_fonds: {
    label: 'Demandes de fonds',
    async run(ctx) {
      const { transaction } = ctx;
      const LigneDemandeFonds = require('../models/LigneDemandeFonds');
      const DemandeFonds = require('../models/DemandeFonds');
      await deleteAll(LigneDemandeFonds, transaction);
      await deleteAll(DemandeFonds, transaction);
    }
  },

  depenses: {
    label: 'Décaissements (dépenses)',
    async run(ctx) {
      const Depense = require('../models/Depense');
      await deleteAll(Depense, ctx.transaction);
    }
  },

  circuits_depenses: {
    label: 'Circuits de dépenses',
    async run(ctx) {
      const CircuitDepense = require('../models/CircuitDepense');
      await deleteAll(CircuitDepense, ctx.transaction);
    }
  },

  finances_proforma: {
    label: 'Cotation (proforma)',
    async run(ctx) {
      const { transaction } = ctx;
      const LigneProforma = require('../models/LigneProforma');
      const Proforma = require('../models/Proforma');
      await deleteAll(LigneProforma, transaction);
      await deleteAll(Proforma, transaction);
    }
  },

  clients: {
    label: 'Clients',
    async run(ctx) {
      const Client = require('../models/Client');
      await deleteAll(Client, ctx.transaction);
    }
  },

  soumissions_besoins: {
    label: 'Soumissions besoins',
    async run(ctx) {
      const { transaction } = ctx;
      const SoumissionBesoinsLigne = require('../models/SoumissionBesoinsLigne');
      const SoumissionBesoins = require('../models/SoumissionBesoins');
      await deleteAll(SoumissionBesoinsLigne, transaction);
      await deleteAll(SoumissionBesoins, transaction);
    }
  },

  gestion_plaintes: {
    label: 'Gestion plaintes',
    async run(ctx) {
      const Plainte = require('../models/Plainte');
      await deleteAll(Plainte, ctx.transaction);
    }
  },

  task_manager: {
    label: 'Task Manager',
    async run(ctx) {
      const { transaction } = ctx;
      const CommentaireTask = require('../models/CommentaireTask');
      const TaskPro = require('../models/TaskPro');
      await deleteAll(CommentaireTask, transaction);
      await deleteAll(TaskPro, transaction);
    }
  },

  file_manager: {
    label: 'File Manager',
    async run(ctx) {
      const { transaction } = ctx;
      const File = require('../models/File');
      const Folder = require('../models/Folder');
      await deleteAll(File, transaction);
      await deleteAll(Folder, transaction);
    }
  },

  utilisateurs: {
    label: 'Utilisateurs',
    description: 'Supprime tous les utilisateurs sauf les comptes Administrateur.',
    async run(ctx) {
      const User = require('../models/User');
      await User.destroy({
        where: { role: { [Op.ne]: 'Administrateur' } },
        transaction: ctx.transaction,
        force: true
      });
    }
  },

  notifications: {
    label: 'Notifications',
    async run(ctx) {
      const Notification = require('../models/Notification');
      await deleteAll(Notification, ctx.transaction);
    }
  },

  parametres_systeme: {
    label: 'Paramètres système',
    description: 'Réinitialise les taux journaliers (les paramètres généraux sont conservés).',
    async run(ctx) {
      const TauxJour = require('../models/TauxJour');
      await deleteAll(TauxJour, ctx.transaction);
    }
  },

  inspections: {
    label: 'Inspections (mines)',
    async run(ctx) {
      const { transaction } = ctx;
      const PaiementRedevance = require('../models/PaiementRedevance');
      const RedevanceMine = require('../models/RedevanceMine');
      const InspectionTerrainMine = require('../models/InspectionTerrainMine');
      const TitrePermisMine = require('../models/TitrePermisMine');
      const OperateurMine = require('../models/OperateurMine');
      await deleteAll(PaiementRedevance, transaction);
      await deleteAll(RedevanceMine, transaction);
      await deleteAll(InspectionTerrainMine, transaction);
      await deleteAll(TitrePermisMine, transaction);
      await deleteAll(OperateurMine, transaction);
    }
  }
};

/** Correspondance chemin frontend → clé module */
const ROUTE_MODULE_MAP = [
  { pattern: /^\/departements\/?$/, moduleKey: 'departements' },
  { pattern: /^\/sous-departements\/?$/, moduleKey: 'sous_departements' },
  { pattern: /^\/bureaux\/directions-provinciales\/?$/, moduleKey: 'directions_provinciales' },
  { pattern: /^\/bureaux\/bureaux-internationaux\/?$/, moduleKey: 'bureaux_internationaux' },
  { pattern: /^\/exploitation(\/|$)/, moduleKey: 'exploitation' },
  { pattern: /^\/rh\/gestion-employes\/?$/, moduleKey: 'rh_employes' },
  { pattern: /^\/rh\/sanctions\/?$/, moduleKey: 'rh_sanctions' },
  { pattern: /^\/rh\/conges-absences\/?$/, moduleKey: 'rh_conges' },
  { pattern: /^\/rh\/temps-presences\/?$/, moduleKey: 'rh_pointages' },
  { pattern: /^\/rh\/paie-avantages\/?$/, moduleKey: 'rh_employes' },
  { pattern: /^\/finances\/caisses\/?$/, moduleKey: 'finances_caisses' },
  { pattern: /^\/finances\/(plan-comptable|ecritures|journal-compte|tresorerie|budget|facturation|etats-financiers)\/?$/, moduleKey: 'finances_comptabilite' },
  { pattern: /^\/finances\/?$/, moduleKey: 'finances_comptabilite' },
  { pattern: /^\/finances\/cotation\/?$/, moduleKey: 'finances_proforma' },
  { pattern: /^\/demandes-fonds\/?$/, moduleKey: 'demandes_fonds' },
  { pattern: /^\/expenses\/?$/, moduleKey: 'depenses' },
  { pattern: /^\/circuits-depenses\/?$/, moduleKey: 'circuits_depenses' },
  { pattern: /^\/clients\/?$/, moduleKey: 'clients' },
  { pattern: /^\/soumissions-besoins\/?$/, moduleKey: 'soumissions_besoins' },
  { pattern: /^\/gestion-plaintes\/?$/, moduleKey: 'gestion_plaintes' },
  { pattern: /^\/task-manager\/?$/, moduleKey: 'task_manager' },
  { pattern: /^\/file-manager\/?$/, moduleKey: 'file_manager' },
  { pattern: /^\/users\/?$/, moduleKey: 'utilisateurs' },
  { pattern: /^\/notifications\/?$/, moduleKey: 'notifications' },
  { pattern: /^\/parametres-systeme\/?$/, moduleKey: 'parametres_systeme' },
  { pattern: /^\/mines\//, moduleKey: 'inspections' }
];

function resolveModuleKeyFromPath(pathname) {
  const path = String(pathname || '').split('?')[0];
  for (const { pattern, moduleKey } of ROUTE_MODULE_MAP) {
    if (pattern.test(path)) return moduleKey;
  }
  return null;
}

function listModules() {
  return Object.entries(MODULE_RESET_REGISTRY).map(([key, def]) => ({
    key,
    label: def.label,
    description: def.description || ''
  }));
}

module.exports = {
  MODULE_RESET_REGISTRY,
  ROUTE_MODULE_MAP,
  resolveModuleKeyFromPath,
  listModules
};
