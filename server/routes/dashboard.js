const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { sequelize } = require('../config/database');
const Chambre = require('../models/Chambre');
const Problematique = require('../models/Problematique');
const Tache = require('../models/Tache');
const Depense = require('../models/Depense');
const User = require('../models/User');
const AffectationChambre = require('../models/AffectationChambre');
const CheckLinge = require('../models/CheckLinge')(sequelize);
const BonMenage = require('../models/BonMenage');
const Pointage = require('../models/Pointage')(sequelize);
const Inventaire = require('../models/Inventaire');
const Demande = require('../models/Demande');
const Plainte = require('../models/Plainte');
const TaskPro = require('../models/TaskPro');
const DemandeConge = require('../models/DemandeConge');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/dashboard/stats - Get comprehensive dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const { Op } = require('sequelize');
    
    // Get all statistics in parallel for better performance
    const [
      roomStats,
      issueStats,
      taskStats,
      expenseStats,
      userStats,
      assignmentStats,
      auditorStats,
      supervisorRHStats
    ] = await Promise.all([
      // Room statistics
      (async () => {
        const totalRooms = await Chambre.count();
        const availableRooms = await Chambre.count({ where: { statut: 'Libre' } });
        const occupiedRooms = await Chambre.count({ where: { statut: 'Occupée' } });
        const maintenanceRooms = await Chambre.count({ where: { statut: 'En maintenance' } });
        const cleaningRooms = await Chambre.count({ where: { statut: 'En nettoyage' } });
        const totalRevenue = await Chambre.sum('prix_nuit', { where: { statut: 'Occupée' } });
        
        return {
          total: totalRooms,
          available: availableRooms,
          occupied: occupiedRooms,
          maintenance: maintenanceRooms,
          cleaning: cleaningRooms,
          totalRevenue: totalRevenue || 0,
          occupancyRate: totalRooms > 0 ? ((occupiedRooms / totalRooms) * 100).toFixed(2) : 0
        };
      })(),

      // Issue statistics
      (async () => {
        const totalIssues = await Problematique.count();
        const openIssues = await Problematique.count({ where: { statut: 'Ouverte' } });
        const inProgressIssues = await Problematique.count({ where: { statut: 'En cours' } });
        const resolvedIssues = await Problematique.count({ where: { statut: 'Résolue' } });
        const urgentIssues = await Problematique.count({ where: { priorite: 'Urgente' } });
        
        // Daily statistics for issues
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const todayCreated = await Problematique.count({
          where: {
            date_creation: {
              [Op.gte]: today,
              [Op.lt]: tomorrow
            }
          }
        });
        
        const todayResolved = await Problematique.count({
          where: {
            statut: 'Résolue',
            date_resolution: {
              [Op.gte]: today,
              [Op.lt]: tomorrow
            }
          }
        });
        
        const todayUrgent = await Problematique.count({
          where: {
            priorite: 'Urgente',
            date_creation: {
              [Op.gte]: today,
              [Op.lt]: tomorrow
            }
          }
        });
        
        const todayInProgress = await Problematique.count({
          where: {
            statut: 'En cours',
            date_creation: {
              [Op.gte]: today,
              [Op.lt]: tomorrow
            }
          }
        });
        
        return {
          total: totalIssues,
          open: openIssues,
          inProgress: inProgressIssues,
          resolved: resolvedIssues,
          urgent: urgentIssues,
          resolutionRate: totalIssues > 0 ? ((resolvedIssues / totalIssues) * 100).toFixed(2) : 0,
          today: todayCreated,
          todayCreated: todayCreated,
          todayResolved: todayResolved,
          todayUrgent: todayUrgent,
          todayInProgress: todayInProgress
        };
      })(),

      // Task statistics
      (async () => {
        const totalTasks = await Tache.count();
        const pendingTasks = await Tache.count({ where: { statut: 'À faire' } });
        const inProgressTasks = await Tache.count({ where: { statut: 'En cours' } });
        const completedTasks = await Tache.count({ where: { statut: 'Terminée' } });
        const urgentTasks = await Tache.count({ where: { priorite: 'Urgente' } });
        const overdueTasks = await Tache.count({
          where: {
            date_limite: { [Op.lt]: new Date() },
            statut: { [Op.ne]: 'Terminée' }
          }
        });
        
        // Daily statistics for tasks
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const todayCreated = await Tache.count({
          where: {
            date_creation: {
              [Op.gte]: today,
              [Op.lt]: tomorrow
            }
          }
        });
        
        const todayCompleted = await Tache.count({
          where: {
            statut: 'Terminée',
            date_fin: {
              [Op.gte]: today,
              [Op.lt]: tomorrow
            }
          }
        });
        
        const todayDue = await Tache.count({
          where: {
            date_limite: {
              [Op.gte]: today,
              [Op.lt]: tomorrow
            },
            statut: {
              [Op.ne]: 'Terminée'
            }
          }
        });
        
        const todayInProgress = await Tache.count({
          where: {
            statut: 'En cours',
            date_creation: {
              [Op.gte]: today,
              [Op.lt]: tomorrow
            }
          }
        });
        
        return {
          total: totalTasks,
          pending: pendingTasks,
          inProgress: inProgressTasks,
          completed: completedTasks,
          urgent: urgentTasks,
          overdue: overdueTasks,
          completionRate: totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : 0,
          today: todayCreated,
          todayCreated: todayCreated,
          todayCompleted: todayCompleted,
          todayDue: todayDue,
          todayInProgress: todayInProgress
        };
      })(),

      // Expense statistics (décaissements)
      (async () => {
        const totalExpenses = await Depense.count();
        const pendingExpenses = await Depense.count({ where: { statut: 'En attente' } });
        const approvedExpenses = await Depense.count({ where: { statut: 'Approuvée' } });
        const paidExpenses = await Depense.count({ where: { statut: 'Payée' } });
        const rejectedExpenses = await Depense.count({ where: { statut: 'Rejetée' } });
        const totalAmount = await Depense.sum('montant');
        const pendingAmount = await Depense.sum('montant', { where: { statut: 'En attente' } });
        const approvedAmount = await Depense.sum('montant', { where: { statut: ['Approuvée', 'Payée'] } });
        const rejectedAmount = await Depense.sum('montant', { where: { statut: 'Rejetée' } });
        return {
          total: totalExpenses,
          pending: pendingExpenses,
          approved: approvedExpenses,
          paid: paidExpenses,
          rejected: rejectedExpenses,
          totalAmount: totalAmount || 0,
          pendingAmount: pendingAmount || 0,
          approvedAmount: approvedAmount || 0,
          rejectedAmount: rejectedAmount || 0,
          approvalRate: totalExpenses > 0 ? (((approvedExpenses + paidExpenses) / totalExpenses) * 100).toFixed(2) : 0
        };
      })(),

      // User statistics
      (async () => {
        const totalUsers = await User.count();
        const activeUsers = await User.count({ where: { actif: true } });
        const recentLogins = await User.count({
          where: {
            derniere_connexion: {
              [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
            }
          }
        });
        
        return {
          total: totalUsers,
          active: activeUsers,
          recentLogins: recentLogins
        };
      })(),

      // Assignment statistics
      (async () => {
        const totalAssignments = await AffectationChambre.count();
        const todayAssignments = await AffectationChambre.count({
          where: {
            date_affectation: {
              [Op.gte]: new Date().setHours(0, 0, 0, 0)
            }
          }
        });
        
        return {
          total: totalAssignments,
          today: todayAssignments
        };
      })(),

      // Auditor statistics (for users with role "Auditeur")
      (async () => {
        console.log('🔍 Computing auditor statistics...');
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

        // Check linges mis à jour du jour
        let checkLingesToday = 0;
        try {
          checkLingesToday = await CheckLinge.count({
            where: {
              updated_at: {
                [Op.between]: [startOfDay, endOfDay]
              }
            }
          });
        } catch (error) {
          console.log('⚠️  Erreur CheckLinge:', error.message);
        }

        // Bons de prélèvement approuvés du jour
        let bonsPrelevementApproved = 0;
        try {
          const todayDate = new Date().toISOString().split('T')[0];
          bonsPrelevementApproved = await BonMenage.count({
            where: {
              etat_chambre_apres_entretien: 'Parfait',
              date_creation: {
                [Op.between]: [startOfDay, endOfDay]
              }
            }
          });
          console.log('📊 Bons prélèvement approuvés:', bonsPrelevementApproved);
        } catch (error) {
          console.log('⚠️  Erreur BonMenage:', error.message);
        }

        // Bons de demandes approuvés du jour
        let bonsDemandesApproved = 0;
        try {
          bonsDemandesApproved = await Demande.count({
            where: {
              statut: 'approuvee',
              date_demande: {
                [Op.between]: [startOfDay, endOfDay]
              }
            }
          });
          console.log('📊 Bons demandes approuvés:', bonsDemandesApproved);
        } catch (error) {
          console.log('⚠️  Erreur Demande:', error.message);
        }

        // Employés présents du jour
        let employesPresents = 0;
        try {
          // Utiliser CURDATE() directement dans MySQL pour éviter les problèmes de fuseau horaire
          // Le champ present est tinyint(1) dans MySQL, donc on compare avec 1
          const result = await sequelize.query(
            `SELECT COUNT(DISTINCT employe_id) as count 
             FROM tbl_pointages 
             WHERE DATE(date_pointage) = CURDATE()
             AND present = 1`,
            {
              type: sequelize.QueryTypes.SELECT
            }
          );
          
          employesPresents = parseInt(result[0]?.count) || 0;
          
          // Si aucun pointage aujourd'hui, utiliser la date la plus récente avec des présences
          // (utile si les pointages sont enregistrés avec un décalage de date)
          if (employesPresents === 0) {
            const mostRecentResult = await sequelize.query(
              `SELECT DATE(date_pointage) as date_pointage, COUNT(DISTINCT employe_id) as count
               FROM tbl_pointages 
               WHERE present = 1
               GROUP BY DATE(date_pointage)
               ORDER BY date_pointage DESC
               LIMIT 1`,
              {
                type: sequelize.QueryTypes.SELECT
              }
            );
            
            if (mostRecentResult.length > 0) {
              const mostRecentDate = mostRecentResult[0].date_pointage;
              const mostRecentCount = parseInt(mostRecentResult[0].count) || 0;
              
              // Vérifier si la date la plus récente est aujourd'hui ou hier (dans les dernières 24h)
              const dateCheck = await sequelize.query(
                `SELECT CURDATE() as today, DATE(:mostRecentDate) as most_recent, 
                        DATEDIFF(CURDATE(), DATE(:mostRecentDate)) as days_diff`,
                {
                  replacements: { mostRecentDate: mostRecentDate },
                  type: sequelize.QueryTypes.SELECT
                }
              );
              
              const daysDiff = parseInt(dateCheck[0]?.days_diff) || 999;
              
              // Si la date la plus récente est aujourd'hui ou hier (0 ou 1 jour de différence), l'utiliser
              if (daysDiff <= 1) {
                employesPresents = mostRecentCount;
                console.log(`📊 Utilisation de la date la plus récente (${mostRecentDate}, ${daysDiff} jour(s) de différence): ${employesPresents} employés`);
              }
            }
          }
          
          console.log('📊 Employés présents aujourd\'hui (Auditeur):', employesPresents);
        } catch (error) {
          console.error('⚠️  Erreur Pointage:', error.message);
          console.error('⚠️  Stack:', error.stack);
        }

        // Articles en rupture de stock
        let articlesRuptureStock = 0;
        try {
          articlesRuptureStock = await Inventaire.count({
            where: {
              quantite: {
                [Op.lte]: 0
              }
            }
          });
        } catch (error) {
          console.log('⚠️  Erreur Inventaire:', error.message);
        }

        // Chambres libres et occupées du jour
        let chambresLibres = 0;
        let chambresOccupees = 0;
        try {
          chambresLibres = await Chambre.count({
            where: { statut: 'Libre' }
          });
          
          // Corriger le statut : "Occupé" au lieu de "Occupée"
          chambresOccupees = await Chambre.count({
            where: { statut: 'Occupé' }
          });
          
          console.log('📊 Chambres - Libres:', chambresLibres, 'Occupées:', chambresOccupees);
        } catch (error) {
          console.log('⚠️  Erreur Chambre:', error.message);
        }

        const auditorStats = {
          checkLingesToday,
          bonsPrelevementApproved,
          bonsDemandesApproved,
          employesPresents,
          articlesRuptureStock,
          chambresLibres,
          chambresOccupees
        };
        
        console.log('📊 Auditor stats computed:', auditorStats);
        return auditorStats;
      })(),

      // Supervisor RH statistics (for users with role "Superviseur RH")
      (async () => {
        console.log('🔍 Computing Supervisor RH statistics...');
        
        // Employés présents du jour
        let employesPresentsAujourdhui = 0;
        try {
          // Utiliser CURDATE() directement dans MySQL pour éviter les problèmes de fuseau horaire
          // Le champ present est tinyint(1) dans MySQL, donc on compare avec 1
          const result = await sequelize.query(
            `SELECT COUNT(DISTINCT employe_id) as count 
             FROM tbl_pointages 
             WHERE DATE(date_pointage) = CURDATE()
             AND present = 1`,
            {
              type: sequelize.QueryTypes.SELECT
            }
          );
          
          employesPresentsAujourdhui = parseInt(result[0]?.count) || 0;
          
          // Si aucun pointage aujourd'hui, utiliser la date la plus récente avec des présences
          // (utile si les pointages sont enregistrés avec un décalage de date)
          if (employesPresentsAujourdhui === 0) {
            const mostRecentResult = await sequelize.query(
              `SELECT DATE(date_pointage) as date_pointage, COUNT(DISTINCT employe_id) as count
               FROM tbl_pointages 
               WHERE present = 1
               GROUP BY DATE(date_pointage)
               ORDER BY date_pointage DESC
               LIMIT 1`,
              {
                type: sequelize.QueryTypes.SELECT
              }
            );
            
            if (mostRecentResult.length > 0) {
              const mostRecentDate = mostRecentResult[0].date_pointage;
              const mostRecentCount = parseInt(mostRecentResult[0].count) || 0;
              
              // Vérifier si la date la plus récente est aujourd'hui ou hier (dans les dernières 24h)
              const dateCheck = await sequelize.query(
                `SELECT CURDATE() as today, DATE(:mostRecentDate) as most_recent, 
                        DATEDIFF(CURDATE(), DATE(:mostRecentDate)) as days_diff`,
                {
                  replacements: { mostRecentDate: mostRecentDate },
                  type: sequelize.QueryTypes.SELECT
                }
              );
              
              const daysDiff = parseInt(dateCheck[0]?.days_diff) || 999;
              
              // Si la date la plus récente est aujourd'hui ou hier (0 ou 1 jour de différence), l'utiliser
              if (daysDiff <= 1) {
                employesPresentsAujourdhui = mostRecentCount;
                console.log(`📊 Utilisation de la date la plus récente (${mostRecentDate}, ${daysDiff} jour(s) de différence): ${employesPresentsAujourdhui} employés`);
              }
            }
          }
          
          console.log('📊 Employés présents aujourd\'hui (Superviseur RH):', employesPresentsAujourdhui);
        } catch (error) {
          console.error('⚠️  Erreur Pointage (Superviseur RH):', error.message);
          console.error('⚠️  Stack:', error.stack);
        }

        const supervisorRHStats = {
          employesPresentsAujourdhui
        };
        
        console.log('📊 Supervisor RH stats computed:', supervisorRHStats);
        return supervisorRHStats;
      })()
    ]);

    // Calculate overall system health
    const systemHealth = {
      rooms: {
        status: roomStats.occupancyRate > 80 ? 'excellent' : roomStats.occupancyRate > 60 ? 'good' : 'needs_attention',
        score: parseFloat(roomStats.occupancyRate)
      },
      issues: {
        status: parseFloat(issueStats.resolutionRate) > 90 ? 'excellent' : parseFloat(issueStats.resolutionRate) > 70 ? 'good' : 'needs_attention',
        score: parseFloat(issueStats.resolutionRate)
      },
      tasks: {
        status: parseFloat(taskStats.completionRate) > 85 ? 'excellent' : parseFloat(taskStats.completionRate) > 65 ? 'good' : 'needs_attention',
        score: parseFloat(taskStats.completionRate)
      },
      expenses: {
        status: parseFloat(expenseStats.approvalRate) > 80 ? 'excellent' : parseFloat(expenseStats.approvalRate) > 60 ? 'good' : 'needs_attention',
        score: parseFloat(expenseStats.approvalRate)
      }
    };

    // Calculate overall score
    const overallScore = (
      systemHealth.rooms.score +
      systemHealth.issues.score +
      systemHealth.tasks.score +
      systemHealth.expenses.score
    ) / 4;

    // --- Task Management & Dashboard widgets (données dynamiques) ---
    let taskManagement = null;
    let decaissement = null;
    let employeesPresence = null;
    let chartData = null;

    try {
      // Plaintes
      const plaintesTotal = await Plainte.count().catch(() => 0);
      const plaintesResolues = await Plainte.count({ where: { statut: 'Résolue' } }).catch(() => 0);
      const plaintesFermees = await Plainte.count({ where: { statut: 'Fermée' } }).catch(() => 0);
      const plaintesEnAttente = await Plainte.count({ where: { statut: 'En attente' } }).catch(() => 0);
      const plaintesCompleted = plaintesResolues + plaintesFermees;
      const plaintesCompletionRate = plaintesTotal > 0 ? Math.round((plaintesCompleted / plaintesTotal) * 100) : 0;

      // Task-pro (sprints)
      const taskProTotal = await TaskPro.count({ where: { supprime: false, archive: false } }).catch(() => 0);
      const taskProEnCours = await TaskPro.count({ where: { colonne_kanban: 'En cours', supprime: false, archive: false } }).catch(() => 0);
      const taskProAFaire = await TaskPro.count({ where: { colonne_kanban: 'À faire', supprime: false, archive: false } }).catch(() => 0);
      const taskProTermine = await TaskPro.count({ where: { colonne_kanban: 'Terminé', supprime: false, archive: false } }).catch(() => 0);
      const taskProEnRetard = await TaskPro.count({
        where: {
          date_echeance: { [Op.lt]: new Date() },
          statut: { [Op.ne]: 'Terminé' },
          supprime: false,
          archive: false
        }
      }).catch(() => 0);
      const sprintsActive = taskProEnCours + taskProAFaire > 0 ? 1 : 0;
      const sprintsBurndown = taskProTotal > 0 ? Math.round((taskProTermine / taskProTotal) * 100) : 0;

      // Équipe & présence
      const employesPresents = supervisorRHStats.employesPresentsAujourdhui || 0;
      const totalUsers = userStats.total || 0;
      const activeUsers = userStats.active || 0;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(todayStart);
      todayEnd.setDate(todayEnd.getDate() + 1);
      let enCongéAujourdhui = 0;
      try {
        const congesEnCours = await DemandeConge.count({
          where: {
            statut: 'approuve',
            date_debut: { [Op.lte]: todayEnd },
            date_fin: { [Op.gte]: todayStart }
          }
        });
        enCongéAujourdhui = congesEnCours;
      } catch (e) { /* ignore */ }
      const absent = Math.max(0, totalUsers - employesPresents - enCongéAujourdhui);
      const attendanceRate = totalUsers > 0 ? Math.round((employesPresents / totalUsers) * 100) : 0;

      taskManagement = {
        projects: {
          active: plaintesTotal - plaintesCompleted,
          completed: plaintesCompleted,
          onHold: plaintesEnAttente,
          total: plaintesTotal,
          completionRate: plaintesCompletionRate
        },
        tasks: {
          total: taskProTotal,
          completed: taskProTermine,
          inProgress: taskProEnCours,
          pending: taskProAFaire,
          overdue: taskProEnRetard,
          completionRate: taskProTotal > 0 ? Math.round((taskProTermine / taskProTotal) * 100) : 0
        },
        sprints: {
          active: sprintsActive,
          completed: taskProTermine,
          velocity: taskProTermine,
          burndown: sprintsBurndown
        },
        team: {
          members: totalUsers,
          active: activeUsers,
          onLeave: enCongéAujourdhui,
          utilization: totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0
        }
      };

      decaissement = {
        total: expenseStats.total,
        approved: expenseStats.approved + expenseStats.paid,
        pending: expenseStats.pending,
        rejected: expenseStats.rejected || 0,
        totalAmount: expenseStats.totalAmount || 0,
        approvedAmount: expenseStats.approvedAmount || 0,
        pendingAmount: expenseStats.pendingAmount || 0,
        rejectedAmount: expenseStats.rejectedAmount || 0
      };

      employeesPresence = {
        presentToday: employesPresents,
        absent,
        onLeave: enCongéAujourdhui,
        late: 0,
        onTime: employesPresents,
        attendanceRate
      };

      // Progression des tâches (7 derniers jours) : terminées par jour + état actuel pour aujourd'hui
      const projectProgress = [];
      const dayLabels = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const dEnd = new Date(d);
        dEnd.setDate(dEnd.getDate() + 1);
        const completed = await Tache.count({
          where: {
            statut: 'Terminée',
            date_fin: { [Op.gte]: d, [Op.lt]: dEnd }
          }
        }).catch(() => 0);
        const isToday = i === 0;
        const inProgress = isToday ? (await Tache.count({ where: { statut: 'En cours' } }).catch(() => 0)) : 0;
        const pending = isToday ? (await Tache.count({ where: { statut: 'À faire' } }).catch(() => 0)) : 0;
        projectProgress.push({
          name: dayLabels[d.getDay()],
          completed,
          inProgress,
          pending
        });
      }

      chartData = {
        projectProgress,
        taskDistribution: [
          { name: 'Terminées', value: taskProTermine, color: '#10b981' },
          { name: 'En cours', value: taskProEnCours, color: '#3b82f6' },
          { name: 'En attente', value: taskProAFaire, color: '#f59e0b' }
        ],
        decaissementStatus: [
          { name: 'Approuvés', value: decaissement.approved, color: '#10b981' },
          { name: 'En attente', value: decaissement.pending, color: '#f59e0b' },
          { name: 'Rejetés', value: decaissement.rejected, color: '#ef4444' }
        ]
      };
    } catch (err) {
      console.error('Dashboard taskManagement/chartData:', err);
    }

    const response = {
      overview: {
        rooms: roomStats,
        issues: issueStats,
        tasks: taskStats,
        expenses: expenseStats,
        users: userStats,
        assignments: assignmentStats
      },
      auditorStats,
      supervisorRHStats,
      systemHealth,
      overallScore: overallScore.toFixed(2),
      lastUpdated: new Date().toISOString(),
      taskManagement,
      decaissement,
      employeesPresence,
      chartData
    };
    
    console.log('🚀 Dashboard response includes auditorStats:', !!response.auditorStats);
    console.log('🚀 Dashboard response includes supervisorRHStats:', !!response.supervisorRHStats);
    console.log('🚀 SupervisorRHStats value:', JSON.stringify(response.supervisorRHStats));
    console.log('🚀 EmployesPresentsAujourdhui:', response.supervisorRHStats?.employesPresentsAujourdhui);
    res.json(response);

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ 
      error: 'Failed to get dashboard statistics',
      message: 'Erreur lors de la récupération des statistiques du tableau de bord'
    });
  }
});

module.exports = router; 