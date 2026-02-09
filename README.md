# 🏢 IGM ERP - Backend API

Backend Node.js/Express pour le système ERP intégré de la société IGM (IGM ERP).

## 📋 À propos

IGM ERP est une solution complète de gestion d'entreprise intégrée pour la société IGM, offrant des modules spécialisés pour la gestion des ressources humaines, la gestion des plaintes, le suivi des tâches et le reporting avancé.

## 🚀 Fonctionnalités principales

### 🎯 Gestion Intégrée
- **Tableaux de bord** : Vues consolidées et indicateurs en temps réel
- **Workflows** : Gestion de processus métier personnalisables
- **Multi-départements** : Gestion hiérarchique des départements et sous-départements
- **Notifications** : Système de notifications en temps réel (Socket.io)

### 👥 Gestion des Ressources Humaines (RH)
- **Gestion des employés** : Profils complets, contrats, documents RH
- **Paiements de salaires** : Gestion des paies et validation
- **Contrats** : Gestion des contrats de travail (CDI, CDD, Stage, etc.)
- **Documents RH** : Stockage et gestion des documents du personnel
- **Sanctions et gratifications** : Suivi des mesures disciplinaires et récompenses
- **Dépendants** : Gestion des personnes à charge

### 📋 Gestion des Plaintes
- **Plaintes internes et externes** : Traitement unifié des réclamations
- **Suivi de statut** : Workflow de traitement des plaintes
- **Résolution** : Actions correctives et satisfaction client
- **Historique** : Traçabilité complète des interventions
- **Reporting** : Statistiques et analyses des plaintes

### ✅ Suivi des Tâches
- **Tâches professionnelles** : Gestion avancée avec système Kanban
- **Assignation** : Attribution multi-utilisateurs et observateurs
- **Priorités et urgences** : Classification et gestion des priorités
- **Checklists** : Suivi détaillé avec listes de vérification
- **Dépendances** : Gestion des dépendances entre tâches
- **Sous-tâches** : Hiérarchie de tâches avec tâches parentes
- **Temps de travail** : Estimation et suivi du temps passé
- **Récurrence** : Tâches récurrentes configurables

### 📊 Reporting
- **Rapports financiers** : Génération de rapports PDF professionnels
- **Rapports RH** : Analyses des ressources humaines
- **Rapports opérationnels** : Statistiques de performance
- **Export de données** : Export dans différents formats

### 💼 Autres Modules
- **Gestion des caisses** : Création, modification, calcul des soldes
- **Paiements partiels** : Gestion des paiements différés et immédiats
- **Inventaire** : Gestion du stock et des articles
- **Affectations** : Gestion des demandes d'affectation
- **Pointages** : Suivi des présences et heures de travail
- **Messagerie** : Communication interne entre utilisateurs
- **Menus et permissions** : Gestion des accès par rôle

## 🛠️ Technologies

- **Runtime** : Node.js 18+
- **Framework** : Express.js
- **Base de Données** : MySQL 8.0+
- **ORM** : Sequelize 6+
- **Authentification** : JWT (JSON Web Tokens)
- **Temps réel** : Socket.io
- **Génération PDF** : PDFKit
- **Upload de fichiers** : Cloudinary / Multer
- **Validation** : Express-validator
- **Tests** : Jest + Supertest

## 📦 Installation

```bash
cd backend
npm install
```

## 🔧 Configuration

1. Copier le fichier d'environnement :
```bash
cp config/env.example .env
```

2. Configurer les variables dans `.env` :
   - Configuration de la base de données
   - JWT Secret
   - Configuration Cloudinary (pour les uploads)
   - Port du serveur
   - Variables d'environnement spécifiques

## 🚀 Démarrage

### Développement
```bash
npm run dev
```

### Production
```bash
npm start
```

### Avec PM2
```bash
npm run deploy:prod
```

### Avec Docker
```bash
npm run docker:compose
```

## 🗄️ Base de Données

### Migrations

Les migrations sont disponibles dans le dossier `database/` :
- `create_tbl_plaintes.sql` : Table des plaintes
- `create_tbl_task_pro.sql` : Table des tâches professionnelles

Exécuter les migrations :
```bash
# Migration des plaintes
node scripts/migrate-plaintes.js

# Migration des tâches professionnelles
node scripts/migrate-task-pro.js

# Ou directement avec MySQL
mysql -u root -p hotel_beatrice < database/create_tbl_plaintes.sql
mysql -u root -p hotel_beatrice < database/create_tbl_task_pro.sql
```

## 🧪 Tests

```bash
npm test
npm run test:coverage
```

## 📚 Documentation

- **Guide de déploiement** : Voir `DEPLOYMENT.md`
- **Guide de déploiement Render** : Voir `RENDER_DEPLOYMENT.md`

## 🔗 API Endpoints principaux

**Base URL** : `http://localhost:5002/api`

### Authentification
- `POST /api/auth/login` - Connexion
- `POST /api/auth/register` - Inscription
- `GET /api/auth/me` - Profil utilisateur actuel

### Ressources Humaines
- `GET /api/employees` - Liste des employés
- `GET /api/contrats` - Gestion des contrats
- `GET /api/documents-rh` - Documents RH
- `GET /api/paiements-salaires` - Paiements de salaires
- `GET /api/sanctions` - Sanctions
- `GET /api/gratifications` - Gratifications

### Plaintes
- `GET /api/plaintes` - Liste des plaintes (avec pagination et filtres)
- `POST /api/plaintes` - Créer une plainte
- `GET /api/plaintes/stats` - Statistiques des plaintes
- `GET /api/plaintes/:id` - Détails d'une plainte
- `PUT /api/plaintes/:id` - Mettre à jour une plainte
- `PATCH /api/plaintes/:id/assign` - Assigner une plainte
- `PATCH /api/plaintes/:id/resolve` - Résoudre une plainte

### Tâches Professionnelles
- `GET /api/task-pro` - Liste des tâches (avec filtres Kanban)
- `POST /api/task-pro` - Créer une tâche
- `GET /api/task-pro/:id` - Détails d'une tâche
- `PUT /api/task-pro/:id` - Mettre à jour une tâche
- `PATCH /api/task-pro/:id/assign` - Assigner une tâche
- `PATCH /api/task-pro/:id/move` - Déplacer dans le Kanban

### Reporting
- `GET /api/reports` - Rapports disponibles
- `POST /api/reports/generate` - Générer un rapport

### Autres
- `GET /api/health` - Santé de l'API
- `GET /api/dashboard` - Tableau de bord
- `GET /api/caisses` - Gestion des caisses
- `GET /api/paiements` - Gestion des paiements

## 🔐 Authentification et Rôles

Le système utilise JWT pour l'authentification et gère plusieurs rôles :
- **Patron** : Accès complet
- **Administrateur** : Administration système
- **Superviseur** : Gestion de département
- **Agent** : Utilisateur standard
- Et autres rôles spécialisés

## 📝 Structure du Projet

```
backend/
├── server/
│   ├── config/          # Configuration (DB, Cloudinary)
│   ├── middleware/      # Middlewares (auth, upload)
│   ├── models/          # Modèles Sequelize
│   ├── routes/          # Routes API
│   ├── services/        # Services métier
│   └── utils/           # Utilitaires
├── database/            # Scripts SQL de migration
├── scripts/             # Scripts utilitaires
├── migrations/          # Migrations Sequelize
└── tests/               # Tests unitaires et d'intégration
```

## 🤝 Contribution

Ce projet est développé pour la société IGM. Pour toute contribution, veuillez contacter l'équipe de développement.

## 📄 Licence

Propriétaire - IGM © 2025

---

**IGM ERP Backend** v2.0.0

*Solution intégrée de gestion d'entreprise pour IGM*
