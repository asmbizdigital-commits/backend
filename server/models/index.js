const User = require('./User');
const Employe = require('./Employe');
const EmployeUser = require('./EmployeUser');
const Chambre = require('./Chambre');
const Problematique = require('./Problematique');
const ProblematiqueImage = require('./ProblematiqueImage');
const Tache = require('./Tache');
const Depense = require('./Depense');
const Inventaire = require('./Inventaire');
const Fournisseur = require('./Fournisseur');
const Achat = require('./Achat');
const LigneAchat = require('./LigneAchat');
const MouvementStock = require('./MouvementStock');
const Entrepot = require('./Entrepot');
const Caisse = require('./Caisse');
const AffectationChambre = require('./AffectationChambre');
const Demande = require('./Demande');
const DemandeAffectation = require('./DemandeAffectation');
const DemandeAffectationLigne = require('./DemandeAffectationLigne');
const DispatchHousekeeping = require('./DispatchHousekeeping');
const DispatchHousekeepingArticle = require('./DispatchHousekeepingArticle');
const Departement = require('./Departement');
const SousDepartement = require('./SousDepartement');
const Notification = require('./Notification');
const DemandeFonds = require('./DemandeFonds');
const LigneDemandeFonds = require('./LigneDemandeFonds');
const FicheExecution = require('./FicheExecution');
const ElementIntervention = require('./ElementIntervention');
const CycleVieArticle = require('./CycleVieArticle');
const MaintenanceArticle = require('./MaintenanceArticle');
const TransfertArticle = require('./TransfertArticle');
const Buanderie = require('./Buanderie');
const PaiementPartiel = require('./PaiementPartiel');
const RappelPaiement = require('./RappelPaiement');
const BonMenage = require('./BonMenage');
const { sequelize } = require('../config/database');
const Contrat = require('./Contrat')(sequelize);
const DocumentRH = require('./DocumentRH')(sequelize);
const PaiementSalaire = require('./PaiementSalaire')(sequelize);
const OffreEmploi = require('./OffreEmploi');
const CandidatureOffre = require('./CandidatureOffre');
const Dependant = require('./Dependant');
const Sanction = require('./Sanction');
const SanctionPro = require('./SanctionPro');
const DemandeConge = require('./DemandeConge');
const Absence = require('./Absence');
const Gratification = require('./Gratification');
const DeviceToken = require('./DeviceToken');
const NettoyageEspacesPublics = require('./NettoyageEspacesPublics');
const CheckLinge = require('./CheckLinge')(sequelize);
const NettoyageChambre = require('./NettoyageChambre')(sequelize);
const Encaissement = require('./Encaissement')(sequelize);
const Pointage = require('./Pointage')(sequelize);
const SuiviMaintenance = require('./SuiviMaintenance')(sequelize);
const Conversation = require('./Conversation')(sequelize);
const Message = require('./Message')(sequelize);
const Plainte = require('./Plainte');
const TaskPro = require('./TaskPro');
const CommentaireTask = require('./CommentaireTask');
const File = require('./File');
const Folder = require('./Folder');
const Circuit = require('./Circuit');
const Validation = require('./Validation');
const CompteFin = require('./CompteFin');
const JournalFin = require('./JournalFin');
const EcritureFin = require('./EcritureFin');
const LigneEcritureFin = require('./LigneEcritureFin');
const BudgetFin = require('./BudgetFin');
const LigneBudgetFin = require('./LigneBudgetFin');
const FactureFin = require('./FactureFin');
const LigneFactureFin = require('./LigneFactureFin');
const Client = require('./Client');
const RedevanceMine = require('./RedevanceMine');
const PaiementRedevance = require('./PaiementRedevance');
const OperateurMine = require('./OperateurMine');
const TitrePermisMine = require('./TitrePermisMine');
const InspectionTerrainMine = require('./InspectionTerrainMine');
const TauxJour = require('./TauxJour');
const ParametresSys = require('./ParametresSys');
const SoumissionBesoins = require('./SoumissionBesoins');
const SoumissionBesoinsLigne = require('./SoumissionBesoinsLigne');
// Alerte model removed

// Associations pour les problématiques
User.hasMany(Problematique, { foreignKey: 'rapporteur_id', as: 'ProblematiquesRapporteur' });
Problematique.belongsTo(User, { foreignKey: 'rapporteur_id', as: 'rapporteur' });

User.hasMany(Problematique, { foreignKey: 'assigne_id', as: 'ProblematiquesAssigne' });
Problematique.belongsTo(User, { foreignKey: 'assigne_id', as: 'assigne' });

// Associations pour les plaintes
User.hasMany(Plainte, { foreignKey: 'rapporteur_id', as: 'PlaintesRapporteur' });
Plainte.belongsTo(User, { foreignKey: 'rapporteur_id', as: 'rapporteur' });

User.hasMany(Plainte, { foreignKey: 'assignee_id', as: 'PlaintesAssignee' });
Plainte.belongsTo(User, { foreignKey: 'assignee_id', as: 'assignee' });

User.hasMany(Plainte, { foreignKey: 'employe_id', as: 'PlaintesEmploye' });
Plainte.belongsTo(User, { foreignKey: 'employe_id', as: 'employe' });

Plainte.belongsTo(Chambre, { foreignKey: 'chambre_id', as: 'chambre' });
Plainte.belongsTo(Departement, { foreignKey: 'departement_id', as: 'departement' });
Plainte.belongsTo(SousDepartement, { foreignKey: 'sous_departement_id', as: 'sous_departement' });

// Associations pour TaskPro
User.hasMany(TaskPro, { foreignKey: 'createur_id', as: 'TasksProCreateur' });
TaskPro.belongsTo(User, { foreignKey: 'createur_id', as: 'createur' });

User.hasMany(TaskPro, { foreignKey: 'assignee_id', as: 'TasksProAssignee' });
TaskPro.belongsTo(User, { foreignKey: 'assignee_id', as: 'assignee' });

TaskPro.belongsTo(Departement, { foreignKey: 'departement_id', as: 'departement' });
TaskPro.belongsTo(SousDepartement, { foreignKey: 'sous_departement_id', as: 'sous_departement' });

TaskPro.hasMany(TaskPro, { foreignKey: 'tache_parent_id', as: 'SousTaches' });
TaskPro.belongsTo(TaskPro, { foreignKey: 'tache_parent_id', as: 'tacheParent' });

// Associations pour CommentaireTask
TaskPro.hasMany(CommentaireTask, { foreignKey: 'task_id', as: 'Commentaires' });
CommentaireTask.belongsTo(TaskPro, { foreignKey: 'task_id', as: 'task' });

User.hasMany(CommentaireTask, { foreignKey: 'user_id', as: 'CommentairesTasks' });
CommentaireTask.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

CommentaireTask.hasMany(CommentaireTask, { foreignKey: 'commentaire_parent_id', as: 'Reponses' });
CommentaireTask.belongsTo(CommentaireTask, { foreignKey: 'commentaire_parent_id', as: 'commentaireParent' });

// Associations pour File et Folder
User.hasMany(File, { foreignKey: 'user_id', as: 'Files' });
File.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Folder.hasMany(File, { foreignKey: 'folder_id', as: 'Files' });
File.belongsTo(Folder, { foreignKey: 'folder_id', as: 'folder' });

Folder.hasMany(Folder, { foreignKey: 'parent_id', as: 'Children' });
Folder.belongsTo(Folder, { foreignKey: 'parent_id', as: 'parent' });

User.hasMany(Folder, { foreignKey: 'user_id', as: 'Folders' });
Folder.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Associations pour les circuits de validation
User.hasMany(Circuit, { foreignKey: 'user_id', as: 'Circuits' });
Circuit.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Circuit.hasMany(File, { foreignKey: 'circuit_id', as: 'Files' });
File.belongsTo(Circuit, { foreignKey: 'circuit_id', as: 'circuit' });

Circuit.hasMany(Validation, { foreignKey: 'circuit_id', as: 'Validations' });
Validation.belongsTo(Circuit, { foreignKey: 'circuit_id', as: 'circuit' });

File.hasMany(Validation, { foreignKey: 'file_id', as: 'Validations' });
Validation.belongsTo(File, { foreignKey: 'file_id', as: 'file' });

User.hasMany(Validation, { foreignKey: 'validateur_id', as: 'Validations' });
Validation.belongsTo(User, { foreignKey: 'validateur_id', as: 'validateur' });

// Associations module Finances
CompteFin.hasMany(CompteFin, { foreignKey: 'parent_id', as: 'Enfants' });
CompteFin.belongsTo(CompteFin, { foreignKey: 'parent_id', as: 'parent' });
JournalFin.hasMany(EcritureFin, { foreignKey: 'journal_id', as: 'ecritures' });
EcritureFin.belongsTo(JournalFin, { foreignKey: 'journal_id', as: 'journal' });
User.hasMany(EcritureFin, { foreignKey: 'created_by', as: 'EcrituresFinCreees' });
EcritureFin.belongsTo(User, { foreignKey: 'created_by', as: 'createur' });
EcritureFin.hasMany(LigneEcritureFin, { foreignKey: 'ecriture_id', as: 'lignes' });
LigneEcritureFin.belongsTo(EcritureFin, { foreignKey: 'ecriture_id', as: 'ecriture' });
CompteFin.hasMany(LigneEcritureFin, { foreignKey: 'compte_id', as: 'lignes' });
LigneEcritureFin.belongsTo(CompteFin, { foreignKey: 'compte_id', as: 'compte' });
BudgetFin.hasMany(LigneBudgetFin, { foreignKey: 'budget_id', as: 'lignes' });
LigneBudgetFin.belongsTo(BudgetFin, { foreignKey: 'budget_id', as: 'budget' });
CompteFin.hasMany(LigneBudgetFin, { foreignKey: 'compte_id', as: 'lignesBudget' });
LigneBudgetFin.belongsTo(CompteFin, { foreignKey: 'compte_id', as: 'compte' });
User.hasMany(BudgetFin, { foreignKey: 'created_by', as: 'BudgetsFinCrees' });
BudgetFin.belongsTo(User, { foreignKey: 'created_by', as: 'createur' });
FactureFin.hasMany(LigneFactureFin, { foreignKey: 'facture_id', as: 'lignes' });
LigneFactureFin.belongsTo(FactureFin, { foreignKey: 'facture_id', as: 'facture' });
CompteFin.hasMany(LigneFactureFin, { foreignKey: 'compte_id', as: 'lignesFacture' });
LigneFactureFin.belongsTo(CompteFin, { foreignKey: 'compte_id', as: 'compte' });
User.hasMany(FactureFin, { foreignKey: 'created_by', as: 'FacturesFinCrees' });
FactureFin.belongsTo(User, { foreignKey: 'created_by', as: 'createur' });
EcritureFin.hasOne(FactureFin, { foreignKey: 'ecriture_id', as: 'facture' });
FactureFin.belongsTo(EcritureFin, { foreignKey: 'ecriture_id', as: 'ecriture' });
Client.hasMany(FactureFin, { foreignKey: 'client_id', as: 'factures' });
FactureFin.belongsTo(Client, { foreignKey: 'client_id', as: 'client' });
Client.hasMany(Plainte, { foreignKey: 'client_id', as: 'plaintes' });
Plainte.belongsTo(Client, { foreignKey: 'client_id', as: 'client' });
Client.hasMany(Tache, { foreignKey: 'client_id', as: 'taches' });
Tache.belongsTo(Client, { foreignKey: 'client_id', as: 'client' });
Client.hasMany(TaskPro, { foreignKey: 'client_id', as: 'tasksPro' });
TaskPro.belongsTo(Client, { foreignKey: 'client_id', as: 'client' });

// Associations Mines / Redevances
RedevanceMine.hasMany(PaiementRedevance, { foreignKey: 'redevance_id', as: 'paiements' });
PaiementRedevance.belongsTo(RedevanceMine, { foreignKey: 'redevance_id', as: 'redevance' });

OperateurMine.hasMany(TitrePermisMine, { foreignKey: 'operateur_id', as: 'titresPermis' });
TitrePermisMine.belongsTo(OperateurMine, { foreignKey: 'operateur_id', as: 'operateur' });

OperateurMine.hasMany(InspectionTerrainMine, { foreignKey: 'operateur_id', as: 'inspectionsTerrain' });
InspectionTerrainMine.belongsTo(OperateurMine, { foreignKey: 'operateur_id', as: 'operateur' });

// Associations pour les tâches
User.hasMany(Tache, { foreignKey: 'createur_id', as: 'TachesCreateur' });
Tache.belongsTo(User, { foreignKey: 'createur_id', as: 'createur' });

User.hasMany(Tache, { foreignKey: 'assigne_id', as: 'TachesAssigne' });
Tache.belongsTo(User, { foreignKey: 'assigne_id', as: 'assigne' });

// Associations pour les paiements de salaires
Employe.hasMany(PaiementSalaire, { foreignKey: 'employe_id', as: 'PaiementsSalairesEmploye' });
PaiementSalaire.belongsTo(Employe, { foreignKey: 'employe_id', as: 'Employe' });

User.hasMany(PaiementSalaire, { foreignKey: 'valide_par', as: 'PaiementsSalairesValides' });
PaiementSalaire.belongsTo(User, { foreignKey: 'valide_par', as: 'Validateur' });

User.hasMany(PaiementSalaire, { foreignKey: 'created_by', as: 'PaiementsSalairesCrees' });
PaiementSalaire.belongsTo(User, { foreignKey: 'created_by', as: 'Createur' });

User.hasMany(PaiementSalaire, { foreignKey: 'updated_by', as: 'PaiementsSalairesModifies' });
PaiementSalaire.belongsTo(User, { foreignKey: 'updated_by', as: 'Modificateur' });

// Associations pour les dépenses
User.hasMany(Depense, { foreignKey: 'demandeur_id', as: 'DepensesDemandeur' });
Depense.belongsTo(User, { foreignKey: 'demandeur_id', as: 'demandeur' });

User.hasMany(Depense, { foreignKey: 'approbateur_id', as: 'DepensesApprobateur' });
Depense.belongsTo(User, { foreignKey: 'approbateur_id', as: 'approbateur' });

// Associations pour les caisses
User.hasMany(Caisse, { foreignKey: 'responsable_id', as: 'CaissesResponsable' });
Caisse.belongsTo(User, { foreignKey: 'responsable_id', as: 'responsable' });

// Associations pour les demandes
User.hasMany(Demande, { foreignKey: 'guichetier_id', as: 'DemandesGuichetier' });
Demande.belongsTo(User, { foreignKey: 'guichetier_id', as: 'guichetier' });

User.hasMany(Demande, { foreignKey: 'superviseur_id', as: 'DemandesSuperviseur' });
Demande.belongsTo(User, { foreignKey: 'superviseur_id', as: 'superviseur' });

// Associations pour les départements
User.hasMany(Departement, { foreignKey: 'responsable_id', as: 'DepartementsResponsable' });
Departement.belongsTo(User, { foreignKey: 'responsable_id', as: 'Responsable' });

// Associations pour les sous-départements
User.hasMany(SousDepartement, { foreignKey: 'responsable_id', as: 'SousDepartementsResponsable' });
SousDepartement.belongsTo(User, { foreignKey: 'responsable_id', as: 'Responsable' });

// Associations pour l'appartenance des utilisateurs aux départements et sous-départements
User.belongsTo(Departement, { foreignKey: 'departement_id', as: 'Departement' });
Departement.hasMany(User, { foreignKey: 'departement_id', as: 'Utilisateurs' });

User.belongsTo(SousDepartement, { foreignKey: 'sous_departement_id', as: 'SousDepartement' });
SousDepartement.hasMany(User, { foreignKey: 'sous_departement_id', as: 'Utilisateurs' });

Departement.hasMany(SousDepartement, { foreignKey: 'departement_id', as: 'SousDepartements' });
SousDepartement.belongsTo(Departement, { foreignKey: 'departement_id', as: 'Departement' });

// Associations pour les problématiques et chambres
Chambre.hasMany(Problematique, { foreignKey: 'chambre_id', as: 'Problematiques' });
Problematique.belongsTo(Chambre, { foreignKey: 'chambre_id', as: 'chambre' });

// Associations pour les problématiques et (sous-)départements
Departement.hasMany(Problematique, { foreignKey: 'departement_id', as: 'Problematiques' });
Problematique.belongsTo(Departement, { foreignKey: 'departement_id', as: 'departement' });

SousDepartement.hasMany(Problematique, { foreignKey: 'sous_departement_id', as: 'Problematiques' });
Problematique.belongsTo(SousDepartement, { foreignKey: 'sous_departement_id', as: 'sous_departement' });

// Associations pour les images des problématiques
Problematique.hasMany(ProblematiqueImage, { foreignKey: 'problematique_id', as: 'images' });
ProblematiqueImage.belongsTo(Problematique, { foreignKey: 'problematique_id', as: 'problematique' });

User.hasMany(ProblematiqueImage, { foreignKey: 'utilisateur_id', as: 'ImagesProblematiques' });
ProblematiqueImage.belongsTo(User, { foreignKey: 'utilisateur_id', as: 'utilisateur' });

// Associations pour les tâches et chambres
Chambre.hasMany(Tache, { foreignKey: 'chambre_id', as: 'Taches' });
Tache.belongsTo(Chambre, { foreignKey: 'chambre_id', as: 'chambre' });

// Associations pour les tâches et problématiques
Problematique.hasMany(Tache, { foreignKey: 'problematique_id', as: 'Taches' });
Tache.belongsTo(Problematique, { foreignKey: 'problematique_id', as: 'problematique' });

// Associations pour les dépenses et chambres
Chambre.hasMany(Depense, { foreignKey: 'chambre_id', as: 'Depenses' });
Depense.belongsTo(Chambre, { foreignKey: 'chambre_id', as: 'chambre' });

// Associations pour les dépenses et caisses
Caisse.hasMany(Depense, { foreignKey: 'caisse_id', as: 'Depenses' });
Depense.belongsTo(Caisse, { foreignKey: 'caisse_id', as: 'caisse' });

// Associations pour l'inventaire
User.hasMany(Inventaire, { foreignKey: 'responsable_id', as: 'InventaireResponsable' });
Inventaire.belongsTo(User, { foreignKey: 'responsable_id', as: 'responsable' });

Chambre.hasMany(Inventaire, { foreignKey: 'chambre_id', as: 'InventaireChambre' });
Inventaire.belongsTo(Chambre, { foreignKey: 'chambre_id', as: 'chambre' });

Entrepot.hasMany(Inventaire, { foreignKey: 'emplacement_id', as: 'InventaireEntrepot' });
Inventaire.belongsTo(Entrepot, { foreignKey: 'emplacement_id', as: 'entrepot' });

// Associations pour les achats
Fournisseur.hasMany(Achat, { foreignKey: 'fournisseur_id', as: 'Achats' });
Achat.belongsTo(Fournisseur, { foreignKey: 'fournisseur_id', as: 'fournisseur' });

User.hasMany(Achat, { foreignKey: 'demandeur_id', as: 'AchatsDemandeur' });
Achat.belongsTo(User, { foreignKey: 'demandeur_id', as: 'demandeur' });

User.hasMany(Achat, { foreignKey: 'approbateur_id', as: 'AchatsApprobateur' });
Achat.belongsTo(User, { foreignKey: 'approbateur_id', as: 'approbateur' });

// Associations pour les lignes d'achat
Achat.hasMany(LigneAchat, { foreignKey: 'achat_id', as: 'lignes' });
LigneAchat.belongsTo(Achat, { foreignKey: 'achat_id', as: 'achat' });

Inventaire.hasMany(LigneAchat, { foreignKey: 'inventaire_id', as: 'LignesAchat' });
LigneAchat.belongsTo(Inventaire, { foreignKey: 'inventaire_id', as: 'inventaire' });

// Associations pour les mouvements de stock
Inventaire.hasMany(MouvementStock, { foreignKey: 'inventaire_id', as: 'MouvementsStock' });
MouvementStock.belongsTo(Inventaire, { foreignKey: 'inventaire_id', as: 'inventaire' });

User.hasMany(MouvementStock, { foreignKey: 'utilisateur_id', as: 'MouvementsStockUtilisateur' });
MouvementStock.belongsTo(User, { foreignKey: 'utilisateur_id', as: 'utilisateur' });

Chambre.hasMany(MouvementStock, { foreignKey: 'chambre_id', as: 'MouvementsStockChambre' });
MouvementStock.belongsTo(Chambre, { foreignKey: 'chambre_id', as: 'chambre' });

Achat.hasMany(MouvementStock, { foreignKey: 'achat_id', as: 'MouvementsStockAchat' });
MouvementStock.belongsTo(Achat, { foreignKey: 'achat_id', as: 'achat' });

// Associations pour les demandes d'affectation
User.hasMany(DemandeAffectation, { foreignKey: 'demandeur_id', as: 'DemandesAffectation' });
DemandeAffectation.belongsTo(User, { foreignKey: 'demandeur_id', as: 'demandeur' });

DemandeAffectation.hasMany(DemandeAffectationLigne, { foreignKey: 'demande_affectation_id', as: 'lignes' });
DemandeAffectationLigne.belongsTo(DemandeAffectation, { foreignKey: 'demande_affectation_id', as: 'demande' });

Inventaire.hasMany(DemandeAffectationLigne, { foreignKey: 'inventaire_id', as: 'DemandesAffectationLignes' });
DemandeAffectationLigne.belongsTo(Inventaire, { foreignKey: 'inventaire_id', as: 'inventaire' });

Chambre.hasMany(DemandeAffectationLigne, { foreignKey: 'chambre_id', as: 'DemandesAffectationLignes' });
DemandeAffectationLigne.belongsTo(Chambre, { foreignKey: 'chambre_id', as: 'chambre' });

// Associations pour les dispatches housekeeping
User.hasMany(DispatchHousekeeping, { foreignKey: 'agent_id', as: 'DispatchesAsAgent' });
DispatchHousekeeping.belongsTo(User, { foreignKey: 'agent_id', as: 'agent' });

User.hasMany(DispatchHousekeeping, { foreignKey: 'created_by', as: 'DispatchesCreated' });
DispatchHousekeeping.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

Chambre.hasMany(DispatchHousekeeping, { foreignKey: 'chambre_id', as: 'Dispatches' });
DispatchHousekeeping.belongsTo(Chambre, { foreignKey: 'chambre_id', as: 'chambre' });

DispatchHousekeeping.hasMany(DispatchHousekeepingArticle, { foreignKey: 'dispatch_id', as: 'articles' });
DispatchHousekeepingArticle.belongsTo(DispatchHousekeeping, { foreignKey: 'dispatch_id', as: 'dispatch' });

Inventaire.hasMany(DispatchHousekeepingArticle, { foreignKey: 'inventaire_id', as: 'DispatchArticles' });
DispatchHousekeepingArticle.belongsTo(Inventaire, { foreignKey: 'inventaire_id', as: 'inventaire' });

// Associations pour les demandes de fonds
DemandeFonds.hasMany(LigneDemandeFonds, { 
  foreignKey: 'demande_fonds_id', 
  as: 'lignes',
  onDelete: 'CASCADE'
});
LigneDemandeFonds.belongsTo(DemandeFonds, { 
  foreignKey: 'demande_fonds_id', 
  as: 'demande' 
});

DemandeFonds.belongsTo(User, { 
  foreignKey: 'demandeur_id', 
  as: 'demandeur' 
});
DemandeFonds.belongsTo(User, { 
  foreignKey: 'superviseur_id', 
  as: 'superviseur' 
});

LigneDemandeFonds.belongsTo(Inventaire, { 
  foreignKey: 'inventaire_id', 
  as: 'inventaire' 
});

// Associations pour les soumissions de besoins
User.hasMany(SoumissionBesoins, { foreignKey: 'demandeur_id', as: 'SoumissionsBesoinsDemandeur' });
SoumissionBesoins.belongsTo(User, { foreignKey: 'demandeur_id', as: 'demandeur' });
User.hasMany(SoumissionBesoins, { foreignKey: 'superviseur_id', as: 'SoumissionsBesoinsSuperviseur' });
SoumissionBesoins.belongsTo(User, { foreignKey: 'superviseur_id', as: 'superviseur' });
SoumissionBesoins.hasMany(SoumissionBesoinsLigne, { foreignKey: 'soumission_besoins_id', as: 'lignes', onDelete: 'CASCADE' });
SoumissionBesoinsLigne.belongsTo(SoumissionBesoins, { foreignKey: 'soumission_besoins_id', as: 'soumission' });
SoumissionBesoinsLigne.belongsTo(Inventaire, { foreignKey: 'inventaire_id', as: 'inventaire' });
Inventaire.hasMany(SoumissionBesoinsLigne, { foreignKey: 'inventaire_id', as: 'SoumissionBesoinsLignes' });
SoumissionBesoinsLigne.belongsTo(Chambre, { foreignKey: 'chambre_id', as: 'chambre' });
Chambre.hasMany(SoumissionBesoinsLigne, { foreignKey: 'chambre_id', as: 'SoumissionBesoinsLignes' });

// Associations pour les fiches d'exécution
FicheExecution.belongsTo(Tache, { 
  foreignKey: 'tache_id', 
  as: 'tache' 
});

FicheExecution.belongsTo(User, { 
  foreignKey: 'responsable_id', 
  as: 'responsable' 
});

FicheExecution.belongsTo(User, { 
  foreignKey: 'superviseur_id', 
  as: 'superviseur' 
});

FicheExecution.hasMany(ElementIntervention, { 
  foreignKey: 'fiche_execution_id', 
  as: 'elements',
  onDelete: 'CASCADE'
});

ElementIntervention.belongsTo(FicheExecution, { 
  foreignKey: 'fiche_execution_id', 
  as: 'fiche' 
});

// Associations pour le cycle de vie des articles
Inventaire.hasMany(CycleVieArticle, { 
  foreignKey: 'article_id', 
  as: 'CycleVie' 
});
CycleVieArticle.belongsTo(Inventaire, { 
  foreignKey: 'article_id', 
  as: 'article' 
});

User.hasMany(CycleVieArticle, { 
  foreignKey: 'utilisateur_id', 
  as: 'OperationsCycleVie' 
});
CycleVieArticle.belongsTo(User, { 
  foreignKey: 'utilisateur_id', 
  as: 'utilisateur' 
});

// Associations pour la maintenance
CycleVieArticle.hasOne(MaintenanceArticle, { 
  foreignKey: 'cycle_vie_id', 
  as: 'maintenance',
  onDelete: 'CASCADE'
});
MaintenanceArticle.belongsTo(CycleVieArticle, { 
  foreignKey: 'cycle_vie_id', 
  as: 'cycleVie' 
});

User.hasMany(MaintenanceArticle, { 
  foreignKey: 'technicien_id', 
  as: 'MaintenancesTechnicien' 
});
MaintenanceArticle.belongsTo(User, { 
  foreignKey: 'technicien_id', 
  as: 'technicien' 
});

// Associations pour les transferts
CycleVieArticle.hasOne(TransfertArticle, { 
  foreignKey: 'cycle_vie_id', 
  as: 'transfert',
  onDelete: 'CASCADE'
});
TransfertArticle.belongsTo(CycleVieArticle, { 
  foreignKey: 'cycle_vie_id', 
  as: 'cycleVie' 
});

Entrepot.hasMany(TransfertArticle, { 
  foreignKey: 'entrepot_origine_id', 
  as: 'TransfertsOrigine' 
});
TransfertArticle.belongsTo(Entrepot, { 
  foreignKey: 'entrepot_origine_id', 
  as: 'entrepotOrigine' 
});

Entrepot.hasMany(TransfertArticle, { 
  foreignKey: 'entrepot_destination_id', 
  as: 'TransfertsDestination' 
});
TransfertArticle.belongsTo(Entrepot, { 
  foreignKey: 'entrepot_destination_id', 
  as: 'entrepotDestination' 
});

User.hasMany(TransfertArticle, { 
  foreignKey: 'responsable_expedition_id', 
  as: 'TransfertsExpedition' 
});
TransfertArticle.belongsTo(User, { 
  foreignKey: 'responsable_expedition_id', 
  as: 'responsableExpedition' 
});

User.hasMany(TransfertArticle, { 
  foreignKey: 'responsable_reception_id', 
  as: 'TransfertsReception' 
});
TransfertArticle.belongsTo(User, { 
  foreignKey: 'responsable_reception_id', 
  as: 'responsableReception' 
});

// Associations pour la buanderie
Buanderie.belongsTo(Inventaire, { 
  foreignKey: 'inventaire_id', 
  as: 'inventaire' 
});
Inventaire.hasMany(Buanderie, { 
  foreignKey: 'inventaire_id', 
  as: 'operationsBuanderie' 
});

Buanderie.belongsTo(Chambre, { 
  foreignKey: 'chambre_id', 
  as: 'chambre' 
});
Chambre.hasMany(Buanderie, { 
  foreignKey: 'chambre_id', 
  as: 'operationsBuanderie' 
});

Buanderie.belongsTo(User, { 
  foreignKey: 'utilisateur_id', 
  as: 'utilisateur' 
});
User.hasMany(Buanderie, { 
  foreignKey: 'utilisateur_id', 
  as: 'OperationsBuanderieUtilisateur' 
});

Buanderie.belongsTo(User, { 
  foreignKey: 'responsable_id', 
  as: 'responsable' 
});
User.hasMany(Buanderie, { 
  foreignKey: 'responsable_id', 
  as: 'OperationsBuanderieResponsable' 
});

// Associations pour les paiements partiels
Depense.hasMany(PaiementPartiel, { 
  foreignKey: 'depense_id', 
  as: 'paiementsPartiels',
  onDelete: 'CASCADE'
});
PaiementPartiel.belongsTo(Depense, { 
  foreignKey: 'depense_id', 
  as: 'depense' 
});

User.hasMany(PaiementPartiel, { 
  foreignKey: 'utilisateur_id', 
  as: 'PaiementsPartielsUtilisateur' 
});
PaiementPartiel.belongsTo(User, { 
  foreignKey: 'utilisateur_id', 
  as: 'utilisateur' 
});

// Associations pour les rappels de paiement
Depense.hasMany(RappelPaiement, { 
  foreignKey: 'depense_id', 
  as: 'rappelsPaiement',
  onDelete: 'CASCADE'
});
RappelPaiement.belongsTo(Depense, { 
  foreignKey: 'depense_id', 
  as: 'depense' 
});

User.hasMany(RappelPaiement, { 
  foreignKey: 'utilisateur_id', 
  as: 'RappelsPaiementUtilisateur' 
});
RappelPaiement.belongsTo(User, { 
  foreignKey: 'utilisateur_id', 
  as: 'utilisateur' 
});

// Associations pour le responsable du paiement
User.hasMany(Depense, { 
  foreignKey: 'responsable_paiement_id', 
  as: 'DepensesResponsablePaiement' 
});
Depense.belongsTo(User, { 
  foreignKey: 'responsable_paiement_id', 
  as: 'responsablePaiement' 
});

// Associations pour les bons de ménage
User.hasMany(BonMenage, { 
  foreignKey: 'utilisateur_id', 
  as: 'BonsMenageUtilisateur' 
});
BonMenage.belongsTo(User, { 
  foreignKey: 'utilisateur_id', 
  as: 'utilisateur' 
});

User.hasMany(BonMenage, { 
  foreignKey: 'created_by', 
  as: 'BonsMenageCreateur' 
});
BonMenage.belongsTo(User, { 
  foreignKey: 'created_by', 
  as: 'createur' 
});

User.hasMany(BonMenage, { 
  foreignKey: 'updated_by', 
  as: 'BonsMenageModificateur' 
});
BonMenage.belongsTo(User, { 
  foreignKey: 'updated_by', 
  as: 'modificateur' 
});

// Associations pour les bons de ménage et chambres
Chambre.hasMany(BonMenage, { 
  foreignKey: 'chambre_id', 
  as: 'BonsMenage' 
});
BonMenage.belongsTo(Chambre, { 
  foreignKey: 'chambre_id', 
  as: 'chambre' 
});

// Associations pour les contrats
User.hasMany(Contrat, { foreignKey: 'employe_id', as: 'Contrats' });
Contrat.belongsTo(User, { foreignKey: 'employe_id', as: 'employe' });

User.hasMany(Contrat, { foreignKey: 'cree_par', as: 'ContratsCrees' });
Contrat.belongsTo(User, { foreignKey: 'cree_par', as: 'createur' });

// Associations pour les documents RH
User.hasMany(DocumentRH, { foreignKey: 'employe_id', as: 'DocumentsRH' });
DocumentRH.belongsTo(User, { foreignKey: 'employe_id', as: 'employe' });

Contrat.hasMany(DocumentRH, { foreignKey: 'contrat_id', as: 'Documents' });
DocumentRH.belongsTo(Contrat, { foreignKey: 'contrat_id', as: 'contrat' });

User.hasMany(DocumentRH, { foreignKey: 'cree_par', as: 'DocumentsRHCrees' });
DocumentRH.belongsTo(User, { foreignKey: 'cree_par', as: 'createur' });

// Associations pour les offres d'emploi
User.hasMany(OffreEmploi, { foreignKey: 'cree_par', as: 'OffresEmploiCrees' });
OffreEmploi.belongsTo(User, { foreignKey: 'cree_par', as: 'createur' });

Departement.hasMany(OffreEmploi, { foreignKey: 'departement_id', as: 'OffresEmploi' });
OffreEmploi.belongsTo(Departement, { foreignKey: 'departement_id', as: 'departement' });

// Associations pour les candidatures
OffreEmploi.hasMany(CandidatureOffre, { foreignKey: 'offre_id', as: 'Candidatures' });
CandidatureOffre.belongsTo(OffreEmploi, { foreignKey: 'offre_id', as: 'offre' });

User.hasMany(CandidatureOffre, { foreignKey: 'traite_par', as: 'CandidaturesTraitees' });
CandidatureOffre.belongsTo(User, { foreignKey: 'traite_par', as: 'traiteur' });

// Associations pour les dépendants
Employe.hasMany(Dependant, { foreignKey: 'employe_id', as: 'Dependants' });
Dependant.belongsTo(Employe, { foreignKey: 'employe_id', as: 'employe' });

// Associations pour les sanctions
Employe.hasMany(Sanction, { foreignKey: 'employe_id', as: 'Sanctions' });
Sanction.belongsTo(Employe, { foreignKey: 'employe_id', as: 'employe' });

Employe.hasMany(Sanction, { foreignKey: 'sanction_par', as: 'SanctionsAppliquees' });
Sanction.belongsTo(Employe, { foreignKey: 'sanction_par', as: 'sanctionPar' });

// Associations pour les sanctions-pro (workflow d'approbation)
Employe.hasMany(SanctionPro, { foreignKey: 'employe_id', as: 'SanctionsPro' });
SanctionPro.belongsTo(Employe, { foreignKey: 'employe_id', as: 'employe' });

User.hasMany(SanctionPro, { foreignKey: 'demandeur_id', as: 'SanctionsProDemandeur' });
SanctionPro.belongsTo(User, { foreignKey: 'demandeur_id', as: 'demandeur' });

User.hasMany(SanctionPro, { foreignKey: 'validateur_id', as: 'SanctionsProValidateur' });
SanctionPro.belongsTo(User, { foreignKey: 'validateur_id', as: 'validateur' });

// Associations demandes de congés et absences
Employe.hasMany(DemandeConge, { foreignKey: 'employe_id', as: 'DemandesConges' });
DemandeConge.belongsTo(Employe, { foreignKey: 'employe_id', as: 'employe' });
User.hasMany(DemandeConge, { foreignKey: 'demandeur_id', as: 'DemandesCongesDemandeur' });
DemandeConge.belongsTo(User, { foreignKey: 'demandeur_id', as: 'demandeur' });
User.hasMany(DemandeConge, { foreignKey: 'validateur_id', as: 'DemandesCongesValidateur' });
DemandeConge.belongsTo(User, { foreignKey: 'validateur_id', as: 'validateur' });

Employe.hasMany(Absence, { foreignKey: 'employe_id', as: 'Absences' });
Absence.belongsTo(Employe, { foreignKey: 'employe_id', as: 'employe' });
DemandeConge.hasMany(Absence, { foreignKey: 'demande_conge_id', as: 'Absences' });
Absence.belongsTo(DemandeConge, { foreignKey: 'demande_conge_id', as: 'demande_conge' });
User.hasMany(Absence, { foreignKey: 'enregistre_par_id', as: 'AbsencesEnregistrees' });
Absence.belongsTo(User, { foreignKey: 'enregistre_par_id', as: 'enregistre_par' });

// Associations pour les gratifications
Employe.hasMany(Gratification, { foreignKey: 'employe_id', as: 'Gratifications' });
Gratification.belongsTo(Employe, { foreignKey: 'employe_id', as: 'employe' });

Employe.hasMany(Gratification, { foreignKey: 'gratification_par', as: 'GratificationsAccordees' });
Gratification.belongsTo(Employe, { foreignKey: 'gratification_par', as: 'gratificationPar' });

// Liaison employé - utilisateur (compte de connexion)
Employe.hasOne(EmployeUser, { foreignKey: 'employe_id', as: 'LiaisonUser' });
EmployeUser.belongsTo(Employe, { foreignKey: 'employe_id', as: 'employe' });
User.hasOne(EmployeUser, { foreignKey: 'user_id', as: 'LiaisonEmploye' });
EmployeUser.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Associations pour les tokens d'appareils
User.hasMany(DeviceToken, { foreignKey: 'user_id', as: 'deviceTokens' });
DeviceToken.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Associations pour les nettoyages d'espaces publics
User.hasMany(NettoyageEspacesPublics, { foreignKey: 'agent_id', as: 'NettoyagesAgent' });
NettoyageEspacesPublics.belongsTo(User, { foreignKey: 'agent_id', as: 'agent' });

User.hasMany(NettoyageEspacesPublics, { foreignKey: 'superviseur_id', as: 'NettoyagesSuperviseur' });
NettoyageEspacesPublics.belongsTo(User, { foreignKey: 'superviseur_id', as: 'superviseur' });

User.hasMany(NettoyageEspacesPublics, { foreignKey: 'created_by', as: 'NettoyagesCrees' });
NettoyageEspacesPublics.belongsTo(User, { foreignKey: 'created_by', as: 'createur' });

User.hasMany(NettoyageEspacesPublics, { foreignKey: 'updated_by', as: 'NettoyagesModifies' });
NettoyageEspacesPublics.belongsTo(User, { foreignKey: 'updated_by', as: 'modificateur' });

// Associations pour le check linge
User.hasMany(CheckLinge, { foreignKey: 'agent_id', as: 'ChecksLingeAgent' });
CheckLinge.belongsTo(User, { foreignKey: 'agent_id', as: 'agent' });

Chambre.hasMany(CheckLinge, { foreignKey: 'chambre_id', as: 'ChecksLinge' });
CheckLinge.belongsTo(Chambre, { foreignKey: 'chambre_id', as: 'chambre' });

Inventaire.hasMany(CheckLinge, { foreignKey: 'article_id', as: 'ChecksLingeArticle' });
CheckLinge.belongsTo(Inventaire, { foreignKey: 'article_id', as: 'article' });

User.hasMany(CheckLinge, { foreignKey: 'created_by', as: 'ChecksLingeCrees' });
CheckLinge.belongsTo(User, { foreignKey: 'created_by', as: 'createur' });

User.hasMany(CheckLinge, { foreignKey: 'updated_by', as: 'ChecksLingeModifies' });
CheckLinge.belongsTo(User, { foreignKey: 'updated_by', as: 'modificateur' });

// Associations pour le nettoyage des chambres
User.hasMany(NettoyageChambre, { foreignKey: 'agent_id', as: 'NettoyagesChambresAgent' });
NettoyageChambre.belongsTo(User, { foreignKey: 'agent_id', as: 'Agent' });

Chambre.hasMany(NettoyageChambre, { foreignKey: 'chambre_id', as: 'NettoyagesChambres' });
NettoyageChambre.belongsTo(Chambre, { foreignKey: 'chambre_id', as: 'Chambre' });

User.hasMany(NettoyageChambre, { foreignKey: 'created_by', as: 'NettoyagesChambresCrees' });
NettoyageChambre.belongsTo(User, { foreignKey: 'created_by', as: 'Createur' });

User.hasMany(NettoyageChambre, { foreignKey: 'updated_by', as: 'NettoyagesChambresModifies' });
NettoyageChambre.belongsTo(User, { foreignKey: 'updated_by', as: 'Modificateur' });

// Associations pour les encaissements
User.hasMany(Encaissement, { foreignKey: 'valide_par', as: 'EncaissementsValides' });
Encaissement.belongsTo(User, { foreignKey: 'valide_par', as: 'Validateur' });

User.hasMany(Encaissement, { foreignKey: 'created_by', as: 'EncaissementsCrees' });
Encaissement.belongsTo(User, { foreignKey: 'created_by', as: 'Createur' });

User.hasMany(Encaissement, { foreignKey: 'updated_by', as: 'EncaissementsModifies' });
Encaissement.belongsTo(User, { foreignKey: 'updated_by', as: 'Modificateur' });

// Associations pour les pointages
Employe.hasMany(Pointage, { foreignKey: 'employe_id', as: 'PointagesEmploye' });
Pointage.belongsTo(Employe, { foreignKey: 'employe_id', as: 'Employe' });

User.hasMany(Pointage, { foreignKey: 'valide_par', as: 'PointagesValides' });
Pointage.belongsTo(User, { foreignKey: 'valide_par', as: 'Validateur' });

User.hasMany(Pointage, { foreignKey: 'created_by', as: 'PointagesCrees' });
Pointage.belongsTo(User, { foreignKey: 'created_by', as: 'Createur' });

User.hasMany(Pointage, { foreignKey: 'updated_by', as: 'PointagesModifies' });
Pointage.belongsTo(User, { foreignKey: 'updated_by', as: 'Modificateur' });

// Associations pour les suivis de maintenance
User.hasMany(SuiviMaintenance, { foreignKey: 'responsable_id', as: 'MaintenancesResponsable' });
SuiviMaintenance.belongsTo(User, { foreignKey: 'responsable_id', as: 'responsable' });

User.hasMany(SuiviMaintenance, { foreignKey: 'createur_id', as: 'MaintenancesCreees' });
SuiviMaintenance.belongsTo(User, { foreignKey: 'createur_id', as: 'createur' });

// Associations pour les conversations et messages
User.hasMany(Conversation, { foreignKey: 'user1_id', as: 'ConversationsUser1' });
User.hasMany(Conversation, { foreignKey: 'user2_id', as: 'ConversationsUser2' });

User.hasMany(Message, { foreignKey: 'sender_id', as: 'MessagesEnvoyes' });
User.hasMany(Message, { foreignKey: 'receiver_id', as: 'MessagesRecus' });

// Initialiser les associations des modèles
if (Conversation.associate) {
  Conversation.associate({ User, Message });
}
if (Message.associate) {
  Message.associate({ User, Conversation });
}

// Alert associations removed

module.exports = {
  User,
  Chambre,
  AffectationChambre,
  Problematique,
  ProblematiqueImage,
  Tache,
  Achat,
  LigneAchat,
  MouvementStock,
  Inventaire,
  Entrepot,
  Fournisseur,
  Depense,
  PaiementSalaire,
  Caisse,
  Demande,
  Departement,
  SousDepartement,
  DemandeAffectation,
  DemandeAffectationLigne,
  Notification,
  DemandeFonds,
  LigneDemandeFonds,
  FicheExecution,
  ElementIntervention,
  CycleVieArticle,
  MaintenanceArticle,
  TransfertArticle,
  Buanderie,
  PaiementPartiel,
  RappelPaiement,
  BonMenage,
  Contrat,
  DocumentRH,
  OffreEmploi,
  CandidatureOffre,
  Dependant,
  Sanction,
  SanctionPro,
  DemandeConge,
  Absence,
  Gratification,
  Employe,
  EmployeUser,
  DeviceToken,
  NettoyageEspacesPublics,
  CheckLinge,
  NettoyageChambre,
  Encaissement,
  Pointage,
  SuiviMaintenance,
  Conversation,
  Message,
  Plainte,
  TaskPro,
  CommentaireTask,
  File,
  Folder,
  Circuit,
  Validation,
  CompteFin,
  JournalFin,
  EcritureFin,
  LigneEcritureFin,
  BudgetFin,
  LigneBudgetFin,
  FactureFin,
  LigneFactureFin,
  RedevanceMine,
  PaiementRedevance,
  OperateurMine,
  TitrePermisMine,
  InspectionTerrainMine,
  SoumissionBesoins,
  SoumissionBesoinsLigne,
  // Alerte removed
}; 