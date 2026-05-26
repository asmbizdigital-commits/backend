const mysql = require('mysql2/promise');
require('dotenv').config();

// Configuration de la base de données
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hotel_beatrice'
};

class Employee {
  constructor(data) {
    // Informations Personnelles (État Civil)
    this.civilite = data.civilite;
    this.nom_famille = data.nom_famille;
    this.nom_usage = data.nom_usage;
    this.prenoms = data.prenoms;
    this.date_naissance = data.date_naissance;
    this.lieu_naissance = data.lieu_naissance;
    this.nationalite = data.nationalite;
    this.numero_securite_sociale = data.numero_securite_sociale;
    this.situation_famille = data.situation_famille;
    this.employeur_direct = data.employeur_direct;
    
    // Coordonnées et Contact
    this.adresse = data.adresse;
    this.code_postal = data.code_postal;
    this.ville = data.ville;
    this.pays = data.pays;
    this.telephone_personnel = data.telephone_personnel;
    this.telephone_domicile = data.telephone_domicile;
    this.email_personnel = data.email_personnel;
    
    // Contact d'urgence
    this.contact_urgence_nom = data.contact_urgence_nom;
    this.contact_urgence_prenom = data.contact_urgence_prenom;
    this.contact_urgence_lien = data.contact_urgence_lien;
    this.contact_urgence_telephone = data.contact_urgence_telephone;
    
    // Informations Professionnelles
    this.matricule = data.matricule;
    this.poste = data.poste;
    this.departement_id = data.departement_id;
    this.sous_departement_id = data.sous_departement_id;
    this.date_embauche = data.date_embauche;
    this.type_contrat = data.type_contrat;
    this.date_fin_contrat = data.date_fin_contrat;
    this.temps_travail = data.temps_travail;
    this.statut = data.statut || 'Actif';
    this.niveau_classification = data.niveau_classification;
    this.salaire_journalier = data.salaire_journalier;
    this.transport = data.transport;
    this.indemnites_diverse = data.indemnites_diverse;
    this.photo_url = data.photo_url;
    
    // Métadonnées
    this.created_by = data.created_by;
    this.updated_by = data.updated_by;
  }

  // Créer un nouvel employé
  static async create(employeeData) {
    const query = `
      INSERT INTO tbl_employes (
        civilite, nom_famille, nom_usage, prenoms, date_naissance, lieu_naissance, nationalite,
        numero_securite_sociale, situation_famille, employeur_direct, adresse, code_postal, ville, pays,
        telephone_personnel, telephone_domicile, email_personnel, contact_urgence_nom,
        contact_urgence_prenom, contact_urgence_lien, contact_urgence_telephone, matricule,
        poste, departement_id, sous_departement_id, date_embauche, type_contrat, date_fin_contrat, temps_travail,
        statut, niveau_classification, salaire_journalier, transport, indemnites_diverse, photo_url, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const dateOnly = (v) => {
      if (v == null || v === '') return null;
      const s = String(v).trim();
      if (!s || s === 'Invalid date') return null;
      return s.length >= 10 ? s.slice(0, 10) : s;
    };

    const indemnites =
      employeeData.indemnites_diverse ?? employeeData.indemnites_diverses ?? 0.0;
    
    const values = [
      employeeData.civilite || null, 
      employeeData.nom_famille || null, 
      employeeData.nom_usage || null,
      employeeData.prenoms || null, 
      dateOnly(employeeData.date_naissance), 
      employeeData.lieu_naissance || null,
      employeeData.nationalite || null, 
      employeeData.numero_securite_sociale || null, 
      employeeData.situation_famille || null,
      employeeData.employeur_direct || null,
      employeeData.adresse || null, 
      employeeData.code_postal || null, 
      employeeData.ville || null, 
      employeeData.pays || null,
      employeeData.telephone_personnel || null, 
      employeeData.telephone_domicile || null, 
      employeeData.email_personnel || null,
      employeeData.contact_urgence_nom || null, 
      employeeData.contact_urgence_prenom || null, 
      employeeData.contact_urgence_lien || null,
      employeeData.contact_urgence_telephone || null, 
      employeeData.matricule || null, 
      employeeData.poste || null,
      employeeData.departement_id || null, 
      employeeData.sous_departement_id || null, 
      dateOnly(employeeData.date_embauche), 
      employeeData.type_contrat || null,
      dateOnly(employeeData.date_fin_contrat), 
      employeeData.temps_travail || null, 
      employeeData.statut || 'Actif',
      employeeData.niveau_classification || null,
      employeeData.salaire_journalier || 0.00,
      employeeData.transport || 0.00,
      indemnites,
      employeeData.photo_url || null, 
      employeeData.created_by || null
    ];

    try {
      const connection = await mysql.createConnection(dbConfig);
      const [result] = await connection.execute(query, values);
      await connection.end();
      return { id: result.insertId, ...employeeData };
    } catch (error) {
      throw new Error(`Erreur lors de la création de l'employé: ${error.message}`);
    }
  }

  // Récupérer tous les employés
  static async findAll(filters = {}) {
    let query = `
      SELECT 
        e.*,
        d.nom as departement_nom,
        d.code as departement_code,
        sd.nom as sous_departement_nom,
        sd.code as sous_departement_code
      FROM tbl_employes e
      LEFT JOIN tbl_departements d ON e.departement_id = d.id
      LEFT JOIN tbl_sous_departements sd ON e.sous_departement_id = sd.id
      WHERE 1=1
    `;
    const values = [];

    // Filtres optionnels
    if (filters.departement) {
      query += ` AND e.departement_id = ?`;
      values.push(filters.departement);
    }
    
    if (filters.statut) {
      query += ` AND e.statut = ?`;
      values.push(filters.statut);
    }
    
    if (filters.search) {
      query += ` AND (e.nom_famille LIKE ? OR e.prenoms LIKE ? OR e.email_personnel LIKE ?)`;
      const searchTerm = `%${filters.search}%`;
      values.push(searchTerm, searchTerm, searchTerm);
    }

    query += ` ORDER BY e.nom_famille, e.prenoms`;

    try {
      const connection = await mysql.createConnection(dbConfig);
      const [rows] = await connection.execute(query, values);
      await connection.end();
      return rows;
    } catch (error) {
      throw new Error(`Erreur lors de la récupération des employés: ${error.message}`);
    }
  }

  // Récupérer un employé par ID
  static async findById(id) {
    const query = `
      SELECT 
        e.*,
        d.nom as departement_nom,
        d.code as departement_code,
        sd.nom as sous_departement_nom,
        sd.code as sous_departement_code
      FROM tbl_employes e
      LEFT JOIN tbl_departements d ON e.departement_id = d.id
      LEFT JOIN tbl_sous_departements sd ON e.sous_departement_id = sd.id
      WHERE e.id = ?
    `;
    
    try {
      const connection = await mysql.createConnection(dbConfig);
      const [rows] = await connection.execute(query, [id]);
      await connection.end();
      return rows[0] || null;
    } catch (error) {
      throw new Error(`Erreur lors de la récupération de l'employé: ${error.message}`);
    }
  }

  // Mettre à jour un employé
  static async update(id, employeeData) {
    const query = `
      UPDATE tbl_employes SET
        civilite = ?, nom_famille = ?, nom_usage = ?, prenoms = ?, date_naissance = ?,
        lieu_naissance = ?, nationalite = ?, numero_securite_sociale = ?, situation_famille = ?, employeur_direct = ?,
        adresse = ?, code_postal = ?, ville = ?, pays = ?, telephone_personnel = ?,
        telephone_domicile = ?, email_personnel = ?, contact_urgence_nom = ?,
        contact_urgence_prenom = ?, contact_urgence_lien = ?, contact_urgence_telephone = ?,
        matricule = ?, poste = ?, departement_id = ?, sous_departement_id = ?, date_embauche = ?, type_contrat = ?,
        date_fin_contrat = ?, temps_travail = ?, statut = ?, niveau_classification = ?,
        salaire_journalier = ?, transport = ?, indemnites_diverse = ?,
        photo_url = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    const values = [
      employeeData.civilite, employeeData.nom_famille, employeeData.nom_usage,
      employeeData.prenoms, employeeData.date_naissance, employeeData.lieu_naissance,
      employeeData.nationalite, employeeData.numero_securite_sociale, employeeData.situation_famille, employeeData.employeur_direct,
      employeeData.adresse, employeeData.code_postal, employeeData.ville, employeeData.pays,
      employeeData.telephone_personnel, employeeData.telephone_domicile, employeeData.email_personnel,
      employeeData.contact_urgence_nom, employeeData.contact_urgence_prenom, employeeData.contact_urgence_lien,
      employeeData.contact_urgence_telephone, employeeData.matricule, employeeData.poste,
      employeeData.departement_id, employeeData.sous_departement_id, employeeData.date_embauche, employeeData.type_contrat,
      employeeData.date_fin_contrat, employeeData.temps_travail, employeeData.statut,
      employeeData.niveau_classification, employeeData.salaire_journalier || 0.00,
      employeeData.transport || 0.00, employeeData.indemnites_diverse || 0.00,
      employeeData.photo_url, employeeData.updated_by, id
    ];

    try {
      const connection = await mysql.createConnection(dbConfig);
      const [result] = await connection.execute(query, values);
      await connection.end();
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Erreur lors de la mise à jour de l'employé: ${error.message}`);
    }
  }

  // Mettre à jour seulement la photo d'un employé
  static async updatePhoto(id, photoUrl) {
    const query = `UPDATE tbl_employes SET photo_url = ?, updated_at = NOW() WHERE id = ?`;
    
    try {
      const connection = await mysql.createConnection(dbConfig);
      const [result] = await connection.execute(query, [photoUrl, id]);
      await connection.end();
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Erreur lors de la mise à jour de la photo: ${error.message}`);
    }
  }

  // Mettre à jour partiellement un employé (seulement les champs fournis)
  static async updatePartial(id, employeeData) {
    // Construire dynamiquement la requête UPDATE
    const fields = [];
    const values = [];
    
    // Mapping des champs frontend vers base de données
    const fieldMapping = {
      civilite: 'civilite',
      nom_famille: 'nom_famille',
      nom_usage: 'nom_usage',
      prenoms: 'prenoms',
      date_naissance: 'date_naissance',
      lieu_naissance: 'lieu_naissance',
      nationalite: 'nationalite',
      numero_securite_sociale: 'numero_securite_sociale',
      situation_famille: 'situation_famille',
      employeur_direct: 'employeur_direct',
      adresse: 'adresse',
      code_postal: 'code_postal',
      ville: 'ville',
      pays: 'pays',
      telephone_personnel: 'telephone_personnel',
      telephone_domicile: 'telephone_domicile',
      email_personnel: 'email_personnel',
      contact_urgence_nom: 'contact_urgence_nom',
      contact_urgence_prenom: 'contact_urgence_prenom',
      contact_urgence_lien: 'contact_urgence_lien',
      contact_urgence_telephone: 'contact_urgence_telephone',
      matricule: 'matricule',
      poste: 'poste',
      departement_id: 'departement_id',
      sous_departement_id: 'sous_departement_id',
      date_embauche: 'date_embauche',
      type_contrat: 'type_contrat',
      date_fin_contrat: 'date_fin_contrat',
      temps_travail: 'temps_travail',
      statut: 'statut',
      niveau_classification: 'niveau_classification',
      salaire_journalier: 'salaire_journalier',
      transport: 'transport',
      indemnites_diverse: 'indemnites_diverse',
      photo_url: 'photo_url',
      updated_by: 'updated_by'
    };

    // Normaliser les dates (YYYY-MM-DD) pour les colonnes DATE MySQL
    const dateFieldKeys = new Set(['date_naissance', 'date_embauche', 'date_fin_contrat']);

    // Ajouter seulement les champs fournis
    Object.keys(employeeData).forEach(key => {
      if (employeeData[key] !== undefined && fieldMapping[key]) {
        let value = employeeData[key];
        if (value && dateFieldKeys.has(key)) {
          try {
            // Accepte Date, string ISO ou 'YYYY-MM-DD'; tronque à 10 chars
            const iso = (value instanceof Date) ? value.toISOString() : String(value);
            value = iso.slice(0, 10);
          } catch (_) {
            // Si parsing échoue, laisse passer la valeur telle quelle
          }
        }
        fields.push(`${fieldMapping[key]} = ?`);
        values.push(value || null);
      }
    });

    if (fields.length === 0) {
      return true; // Rien à mettre à jour
    }

    // Ajouter updated_at et id
    fields.push('updated_at = NOW()');
    values.push(id);

    const query = `UPDATE tbl_employes SET ${fields.join(', ')} WHERE id = ?`;
    
    try {
      const connection = await mysql.createConnection(dbConfig);
      const [result] = await connection.execute(query, values);
      await connection.end();
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Erreur lors de la mise à jour partielle de l'employé: ${error.message}`);
    }
  }

  // Supprimer un employé
  static async delete(id) {
    const query = `DELETE FROM tbl_employes WHERE id = ?`;
    
    try {
      const connection = await mysql.createConnection(dbConfig);
      const [result] = await connection.execute(query, [id]);
      await connection.end();
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`Erreur lors de la suppression de l'employé: ${error.message}`);
    }
  }

  // Récupérer les statistiques des employés
  static async getStats() {
    const query = `
      SELECT 
        COUNT(*) as total_employes,
        COUNT(CASE WHEN statut = 'Actif' THEN 1 END) as employes_actifs,
        COUNT(CASE WHEN statut = 'Inactif' THEN 1 END) as employes_inactifs,
        COUNT(CASE WHEN departement = 'Réception' THEN 1 END) as reception,
        COUNT(CASE WHEN departement = 'Restauration' THEN 1 END) as restauration,
        COUNT(CASE WHEN departement = 'Ménage' THEN 1 END) as menage,
        COUNT(CASE WHEN departement = 'Maintenance' THEN 1 END) as maintenance,
        COUNT(CASE WHEN departement = 'Sécurité' THEN 1 END) as securite,
        COUNT(CASE WHEN departement = 'Administration' THEN 1 END) as administration,
        COUNT(CASE WHEN departement = 'Ressources Humaines' THEN 1 END) as rh,
        COUNT(CASE WHEN departement = 'Comptabilité' THEN 1 END) as comptabilite
      FROM tbl_employes
    `;
    
    try {
      const connection = await mysql.createConnection(dbConfig);
      const [rows] = await connection.execute(query);
      await connection.end();
      return rows[0];
    } catch (error) {
      throw new Error(`Erreur lors de la récupération des statistiques: ${error.message}`);
    }
  }
}

module.exports = Employee;
