const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const models = require('../models');
const { Circuit, File, Validation, User } = models;
const { authenticateToken } = require('../middleware/auth');

// Debug: Verify models are loaded
if (!Circuit) {
  console.error('❌ ERROR: Circuit model is not available in routes/circuits.js');
  console.error('Available models:', Object.keys(models));
}

// GET /api/circuits - Get all circuits
router.get('/', authenticateToken, async (req, res) => {
  try {
    const circuits = await Circuit.findAll({
      where: { actif: true },
      include: [
        { model: User, as: 'user', attributes: ['id', 'nom', 'prenom', 'email'] }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json({ circuits });
  } catch (error) {
    console.error('Get circuits error:', error);
    res.status(500).json({ error: 'Failed to get circuits', message: error.message });
  }
});

// GET /api/circuits/:id - Get a specific circuit
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const circuit = await Circuit.findByPk(req.params.id, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'nom', 'prenom', 'email'] }
      ]
    });

    if (!circuit) {
      return res.status(404).json({ error: 'Circuit not found' });
    }

    res.json({ circuit });
  } catch (error) {
    console.error('Get circuit error:', error);
    res.status(500).json({ error: 'Failed to get circuit', message: error.message });
  }
});

// POST /api/circuits - Create a new circuit
router.post('/', authenticateToken, [
  body('nom').notEmpty().withMessage('Le nom est requis'),
  body('etapes').isArray().withMessage('Les étapes doivent être un tableau'),
  body('etapes.*.nom').notEmpty().withMessage('Chaque étape doit avoir un nom'),
  body('etapes.*.validateur_id').optional().isInt().withMessage('L\'ID du validateur doit être un entier')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Debug: Check if Circuit is defined
    if (!Circuit) {
      console.error('Circuit model is undefined');
      return res.status(500).json({ error: 'Circuit model not available', message: 'Circuit model is undefined' });
    }

    const { nom, description, etapes } = req.body;

    console.log('Creating circuit with data:', { nom, description, etapes, user_id: req.user.id });

    const circuit = await Circuit.create({
      nom,
      description: description || null,
      etapes: etapes || [],
      actif: true,
      user_id: req.user.id
    });

    const circuitWithUser = await Circuit.findByPk(circuit.id, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'nom', 'prenom', 'email'] }
      ]
    });

    res.status(201).json({ circuit: circuitWithUser });
  } catch (error) {
    console.error('Create circuit error:', error);
    res.status(500).json({ error: 'Failed to create circuit', message: error.message });
  }
});

// PUT /api/circuits/:id - Update a circuit
router.put('/:id', authenticateToken, [
  body('nom').optional().notEmpty().withMessage('Le nom ne peut pas être vide'),
  body('etapes').optional().isArray().withMessage('Les étapes doivent être un tableau')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const circuit = await Circuit.findByPk(req.params.id);
    if (!circuit) {
      return res.status(404).json({ error: 'Circuit not found' });
    }

    const { nom, description, etapes, actif } = req.body;

    await circuit.update({
      nom: nom || circuit.nom,
      description: description !== undefined ? description : circuit.description,
      etapes: etapes || circuit.etapes,
      actif: actif !== undefined ? actif : circuit.actif
    });

    const updatedCircuit = await Circuit.findByPk(circuit.id, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'nom', 'prenom', 'email'] }
      ]
    });

    res.json({ circuit: updatedCircuit });
  } catch (error) {
    console.error('Update circuit error:', error);
    res.status(500).json({ error: 'Failed to update circuit', message: error.message });
  }
});

// DELETE /api/circuits/:id - Delete a circuit (soft delete)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const circuit = await Circuit.findByPk(req.params.id);
    if (!circuit) {
      return res.status(404).json({ error: 'Circuit not found' });
    }

    // Check if circuit is used by any files
    const filesUsingCircuit = await File.count({ where: { circuit_id: circuit.id } });
    if (filesUsingCircuit > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete circuit', 
        message: `Ce circuit est utilisé par ${filesUsingCircuit} document(s)` 
      });
    }

    await circuit.update({ actif: false });
    res.json({ message: 'Circuit désactivé avec succès' });
  } catch (error) {
    console.error('Delete circuit error:', error);
    res.status(500).json({ error: 'Failed to delete circuit', message: error.message });
  }
});

// POST /api/circuits/:id/assign - Assign circuit to a file
router.post('/:id/assign', authenticateToken, [
  body('file_id').isInt().withMessage('L\'ID du fichier est requis')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const circuit = await Circuit.findByPk(req.params.id);
    if (!circuit) {
      return res.status(404).json({ error: 'Circuit not found' });
    }

    const { file_id } = req.body;
    const file = await File.findByPk(file_id);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Assign circuit to file
    await file.update({
      circuit_id: circuit.id,
      etape_actuelle: circuit.etapes && circuit.etapes.length > 0 ? circuit.etapes[0].nom : null,
      statut_workflow: 'En attente'
    });

    // Create validation records for each step
    if (circuit.etapes && circuit.etapes.length > 0) {
      const validations = circuit.etapes.map((etape, index) => ({
        file_id: file.id,
        circuit_id: circuit.id,
        etape: etape.nom,
        ordre: index + 1,
        validateur_id: etape.validateur_id || null,
        statut: index === 0 ? 'En attente' : 'En attente'
      }));

      await Validation.bulkCreate(validations);
    }

    const updatedFile = await File.findByPk(file.id, {
      include: [
        { model: Circuit, as: 'circuit' },
        { model: User, as: 'user', attributes: ['id', 'nom', 'prenom', 'email'] }
      ]
    });

    res.json({ file: updatedFile, message: 'Circuit assigné avec succès' });
  } catch (error) {
    console.error('Assign circuit error:', error);
    res.status(500).json({ error: 'Failed to assign circuit', message: error.message });
  }
});

module.exports = router;

