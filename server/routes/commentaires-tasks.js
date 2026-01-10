const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { Op } = require('sequelize');
const CommentaireTask = require('../models/CommentaireTask');
const TaskPro = require('../models/TaskPro');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/commentaires-tasks - Get all comments for a task
router.get('/', [
  query('task_id').isInt().withMessage('task_id is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { task_id } = req.query;

    const commentaires = await CommentaireTask.findAll({
      where: {
        task_id: parseInt(task_id),
        supprime: false
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'nom', 'prenom', 'email']
        }
      ],
      order: [['created_at', 'ASC']]
    });

    res.json({ 
      commentaires: commentaires.map(c => c.toJSON())
    });

  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ 
      error: 'Failed to get comments',
      message: 'Erreur lors de la récupération des commentaires',
      details: error.message
    });
  }
});

// GET /api/commentaires-tasks/:id - Get specific comment
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const commentaire = await CommentaireTask.findByPk(id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'nom', 'prenom', 'email']
        },
        {
          model: TaskPro,
          as: 'task',
          attributes: ['id', 'titre']
        }
      ]
    });

    if (!commentaire) {
      return res.status(404).json({ 
        error: 'Comment not found',
        message: 'Commentaire non trouvé'
      });
    }

    res.json({ commentaire: commentaire.toJSON() });

  } catch (error) {
    console.error('Get comment error:', error);
    res.status(500).json({ 
      error: 'Failed to get comment',
      message: 'Erreur lors de la récupération du commentaire',
      details: error.message
    });
  }
});

// POST /api/commentaires-tasks - Create new comment
router.post('/', [
  body('task_id').isInt().withMessage('task_id is required'),
  body('commentaire').isLength({ min: 1, max: 5000 }).withMessage('Le commentaire doit contenir entre 1 et 5000 caractères'),
  body('commentaire_parent_id').optional().isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { task_id, commentaire, commentaire_parent_id, fichiers_joints } = req.body;

    // Verify task exists
    const task = await TaskPro.findByPk(task_id);
    if (!task) {
      return res.status(404).json({ 
        error: 'Task not found',
        message: 'Tâche non trouvée'
      });
    }

    // Verify parent comment exists if provided
    if (commentaire_parent_id) {
      const parentComment = await CommentaireTask.findByPk(commentaire_parent_id);
      if (!parentComment || parentComment.task_id !== parseInt(task_id)) {
        return res.status(400).json({ 
          error: 'Invalid parent comment',
          message: 'Commentaire parent invalide'
        });
      }
    }

    const nouveauCommentaire = await CommentaireTask.create({
      task_id: parseInt(task_id),
      user_id: req.user.id,
      commentaire: commentaire.trim(),
      commentaire_parent_id: commentaire_parent_id ? parseInt(commentaire_parent_id) : null,
      fichiers_joints: fichiers_joints || null
    });

    // Load with user info
    const commentaireWithUser = await CommentaireTask.findByPk(nouveauCommentaire.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'nom', 'prenom', 'email']
        }
      ]
    });

    // Update task comment count
    await task.addToHistory(req.user.id, 'commented', { 
      comment_id: nouveauCommentaire.id,
      comment_length: commentaire.length 
    });

    res.status(201).json({ 
      message: 'Commentaire ajouté avec succès',
      commentaire: commentaireWithUser.toJSON()
    });

  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({ 
      error: 'Failed to create comment',
      message: 'Erreur lors de la création du commentaire',
      details: error.message
    });
  }
});

// PUT /api/commentaires-tasks/:id - Update comment
router.put('/:id', [
  body('commentaire').isLength({ min: 1, max: 5000 }).withMessage('Le commentaire doit contenir entre 1 et 5000 caractères')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { id } = req.params;
    const { commentaire, fichiers_joints } = req.body;

    const commentaireToUpdate = await CommentaireTask.findByPk(id);
    if (!commentaireToUpdate) {
      return res.status(404).json({ 
        error: 'Comment not found',
        message: 'Commentaire non trouvé'
      });
    }

    // Check if user owns the comment
    if (commentaireToUpdate.user_id !== req.user.id) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Vous n\'êtes pas autorisé à modifier ce commentaire'
      });
    }

    await commentaireToUpdate.update({
      commentaire: commentaire.trim(),
      edite: true,
      date_edition: new Date(),
      fichiers_joints: fichiers_joints !== undefined ? fichiers_joints : commentaireToUpdate.fichiers_joints
    });

    // Load with user info
    const updatedComment = await CommentaireTask.findByPk(id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'nom', 'prenom', 'email']
        }
      ]
    });

    res.json({ 
      message: 'Commentaire mis à jour avec succès',
      commentaire: updatedComment.toJSON()
    });

  } catch (error) {
    console.error('Update comment error:', error);
    res.status(500).json({ 
      error: 'Failed to update comment',
      message: 'Erreur lors de la mise à jour du commentaire',
      details: error.message
    });
  }
});

// DELETE /api/commentaires-tasks/:id - Delete comment (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const commentaire = await CommentaireTask.findByPk(id);

    if (!commentaire) {
      return res.status(404).json({ 
        error: 'Comment not found',
        message: 'Commentaire non trouvé'
      });
    }

    // Check if user owns the comment or is admin
    if (commentaire.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Vous n\'êtes pas autorisé à supprimer ce commentaire'
      });
    }

    await commentaire.update({
      supprime: true,
      date_suppression: new Date()
    });

    res.json({ 
      message: 'Commentaire supprimé avec succès'
    });

  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ 
      error: 'Failed to delete comment',
      message: 'Erreur lors de la suppression du commentaire',
      details: error.message
    });
  }
});

// PATCH /api/commentaires-tasks/:id/like - Toggle like on comment
router.patch('/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    const commentaire = await CommentaireTask.findByPk(id);

    if (!commentaire) {
      return res.status(404).json({ 
        error: 'Comment not found',
        message: 'Commentaire non trouvé'
      });
    }

    await commentaire.toggleLike(req.user.id);

    // Load with user info
    const updatedComment = await CommentaireTask.findByPk(id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'nom', 'prenom', 'email']
        }
      ]
    });

    res.json({ 
      message: 'Like mis à jour',
      commentaire: updatedComment.toJSON()
    });

  } catch (error) {
    console.error('Toggle like error:', error);
    res.status(500).json({ 
      error: 'Failed to toggle like',
      message: 'Erreur lors de la mise à jour du like',
      details: error.message
    });
  }
});

module.exports = router;

