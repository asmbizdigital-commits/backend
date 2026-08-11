const express = require('express');
const { Op } = require('sequelize');
const { authenticateToken } = require('../middleware/auth');
const { requireMonitoringPhaseTestAccess } = require('../utils/monitoringPhaseTestAccess');
const DossierActivityLog = require('../models/DossierActivityLog');
const Connaissement = require('../models/Connaissement');
const Zone = require('../models/Zone');
const BureauInternational = require('../models/BureauInternational');
const {
  ACTION_LABELS_FR,
  SLA_MS,
  scoreFromDuration,
  startOfDay,
  endOfDay
} = require('../utils/dossierActivityLog');

const router = express.Router();
router.use(authenticateToken);
router.use(requireMonitoringPhaseTestAccess);

function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return null;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

function serializeEvent(row) {
  const plain = row.toJSON ? row.toJSON() : row;
  return {
    id: plain.id,
    connaissementId: plain.connaissementId,
    actionType: plain.actionType,
    actionLabel: ACTION_LABELS_FR[plain.actionType] || plain.actionType,
    actorId: plain.actorId,
    actorName: plain.actorName,
    actorRole: plain.actorRole,
    assigneeId: plain.assigneeId,
    assigneeName: plain.assigneeName,
    taskProId: plain.taskProId,
    assignationId: plain.assignationId,
    dossierRef: plain.dossierRef,
    blNumber: plain.blNumber,
    metadata: plain.metadata,
    durationMs: plain.durationMs,
    durationLabel: formatDuration(plain.durationMs),
    referenceAt: plain.referenceAt,
    createdAt: plain.createdAt,
    score: scoreFromDuration(plain.actionType, plain.durationMs),
    slaMs: SLA_MS[plain.actionType] || null
  };
}

async function loadGeoByConnaissementIds(ids) {
  const geoMap = new Map();
  if (!ids.length) return geoMap;

  const rows = await Connaissement.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ['id', 'zoneConnaissement', 'bureauConnaissement'],
    include: [
      {
        model: Zone,
        as: 'Zone',
        attributes: ['id', 'code', 'nom'],
        required: false
      },
      {
        model: BureauInternational,
        as: 'BureauInternational',
        attributes: ['id', 'nom', 'code', 'ville', 'pays'],
        required: false
      }
    ]
  });

  for (const row of rows) {
    const plain = row.toJSON ? row.toJSON() : row;
    geoMap.set(String(plain.id), {
      zoneId: plain.zoneConnaissement ?? plain.Zone?.id ?? null,
      zoneLabel: plain.Zone?.nom || plain.Zone?.code || null,
      bureauId: plain.bureauConnaissement ?? plain.BureauInternational?.id ?? null,
      bureauLabel:
        plain.BureauInternational?.nom ||
        plain.BureauInternational?.code ||
        null
    });
  }
  return geoMap;
}

/**
 * GET /api/monitoring-phase-test/today
 * Feed du jour + dossiers touchés + évaluation.
 */
router.get('/today', async (req, res) => {
  try {
    const dayParam = req.query.date ? new Date(String(req.query.date)) : new Date();
    if (Number.isNaN(dayParam.getTime())) {
      return res.status(400).json({ success: false, message: 'Date invalide.' });
    }
    const from = startOfDay(dayParam);
    const to = endOfDay(dayParam);

    const rows = await DossierActivityLog.findAll({
      where: {
        createdAt: { [Op.between]: [from, to] }
      },
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC']
      ],
      limit: 2000
    });

    const events = rows.map(serializeEvent);

    const dossiersMap = new Map();
    const actorsMap = new Map();
    const byAction = {};

    for (const ev of events) {
      byAction[ev.actionType] = (byAction[ev.actionType] || 0) + 1;

      const dKey = String(ev.connaissementId);
      if (!dossiersMap.has(dKey)) {
        dossiersMap.set(dKey, {
          connaissementId: ev.connaissementId,
          dossierRef: ev.dossierRef,
          blNumber: ev.blNumber,
          actionsCount: 0,
          totalDurationMs: 0,
          lastActionAt: ev.createdAt,
          firstActionAt: ev.createdAt,
          actors: new Set(),
          actionTypes: new Set(),
          scores: { good: 0, warn: 0, critical: 0, unknown: 0 },
          events: []
        });
      }
      const d = dossiersMap.get(dKey);
      d.actionsCount += 1;
      if (ev.durationMs != null) d.totalDurationMs += ev.durationMs;
      d.actors.add(ev.actorName || '—');
      if (ev.assigneeName) d.actors.add(ev.assigneeName);
      d.actionTypes.add(ev.actionType);
      d.scores[ev.score] = (d.scores[ev.score] || 0) + 1;
      d.events.push(ev);
      if (new Date(ev.createdAt) > new Date(d.lastActionAt)) d.lastActionAt = ev.createdAt;
      if (new Date(ev.createdAt) < new Date(d.firstActionAt)) d.firstActionAt = ev.createdAt;

      const aKey = String(ev.actorId || ev.actorName || 'unknown');
      if (!actorsMap.has(aKey)) {
        actorsMap.set(aKey, {
          actorId: ev.actorId,
          actorName: ev.actorName || '—',
          actorRole: ev.actorRole,
          actionsCount: 0,
          totalDurationMs: 0,
          dossierIds: new Set(),
          scores: { good: 0, warn: 0, critical: 0, unknown: 0 },
          byAction: {}
        });
      }
      const a = actorsMap.get(aKey);
      a.actionsCount += 1;
      if (ev.connaissementId != null) a.dossierIds.add(String(ev.connaissementId));
      if (ev.durationMs != null) a.totalDurationMs += ev.durationMs;
      a.scores[ev.score] = (a.scores[ev.score] || 0) + 1;
      a.byAction[ev.actionType] = (a.byAction[ev.actionType] || 0) + 1;
    }

    const geoMap = await loadGeoByConnaissementIds(
      Array.from(dossiersMap.keys())
        .map((id) => parseInt(id, 10))
        .filter((id) => !Number.isNaN(id) && id > 0)
    );

    const dossiers = Array.from(dossiersMap.values())
      .map((d) => {
        const cycleMs =
          d.firstActionAt && d.lastActionAt
            ? Math.max(0, new Date(d.lastActionAt).getTime() - new Date(d.firstActionAt).getTime())
            : d.totalDurationMs;
        let evalScore = 'good';
        if (d.scores.critical > 0) evalScore = 'critical';
        else if (d.scores.warn > 0) evalScore = 'warn';
        const geo = geoMap.get(String(d.connaissementId)) || {};
        return {
          ...d,
          actors: Array.from(d.actors),
          actionTypes: Array.from(d.actionTypes),
          cycleMs,
          cycleLabel: formatDuration(cycleMs),
          totalDurationLabel: formatDuration(d.totalDurationMs),
          evalScore,
          zoneId: geo.zoneId ?? null,
          zoneLabel: geo.zoneLabel ?? null,
          bureauId: geo.bureauId ?? null,
          bureauLabel: geo.bureauLabel ?? null,
          events: d.events.sort(
            (x, y) => new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime()
          )
        };
      })
      .sort((a, b) => new Date(b.lastActionAt) - new Date(a.lastActionAt));

    const actors = Array.from(actorsMap.values())
      .map((a) => {
        const avg = a.actionsCount ? Math.round(a.totalDurationMs / a.actionsCount) : 0;
        let evalScore = 'good';
        const rated = a.scores.good + a.scores.warn + a.scores.critical;
        if (rated > 0) {
          const criticalRate = a.scores.critical / rated;
          const warnRate = a.scores.warn / rated;
          if (criticalRate >= 0.25) evalScore = 'critical';
          else if (warnRate + criticalRate >= 0.35) evalScore = 'warn';
        }
        const { dossierIds, ...actorRest } = a;
        return {
          ...actorRest,
          dossiersCount: dossierIds.size,
          avgDurationMs: avg,
          avgDurationLabel: formatDuration(avg),
          totalDurationLabel: formatDuration(a.totalDurationMs),
          evalScore,
          efficiencyPct:
            rated > 0 ? Math.round((a.scores.good / rated) * 100) : null
        };
      })
      .sort((a, b) => b.actionsCount - a.actionsCount);

    const scoredEvents = events.filter((e) => e.score !== 'unknown');
    const dayGood = scoredEvents.filter((e) => e.score === 'good').length;
    const dayWarn = scoredEvents.filter((e) => e.score === 'warn').length;
    const dayCritical = scoredEvents.filter((e) => e.score === 'critical').length;
    const rated = dayGood + dayWarn + dayCritical;
    let dayEval = 'good';
    if (rated > 0) {
      if (dayCritical / rated >= 0.2) dayEval = 'critical';
      else if ((dayWarn + dayCritical) / rated >= 0.35) dayEval = 'warn';
    }

    const completedPipeline = dossiers.filter((d) =>
      d.actionTypes.includes('add_feri')
    ).length;

    res.json({
      success: true,
      date: from.toISOString().slice(0, 10),
      from: from.toISOString(),
      to: to.toISOString(),
      summary: {
        eventsCount: events.length,
        dossiersCount: dossiers.length,
        actorsCount: actors.length,
        completedPipeline,
        scores: { good: dayGood, warn: dayWarn, critical: dayCritical, unknown: events.length - rated },
        efficiencyPct: rated > 0 ? Math.round((dayGood / rated) * 100) : null,
        dayEval,
        byAction
      },
      events,
      dossiers,
      actors,
      actionLabels: ACTION_LABELS_FR,
      slaMs: SLA_MS
    });
  } catch (error) {
    console.error('GET /api/monitoring-phase-test/today', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du chargement du monitoring.'
    });
  }
});

module.exports = router;
