import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { runPreValidation } from './src/server/preValidator.js';
import { predictRisk, evaluateRequestRisk } from './src/server/riskEngine.js';
import { loadAndAnalyzeEventLog } from './src/server/processMining.js';
import { inMemoryAuditLog, inMemoryRequests, logAuditEntry } from './src/server/auditLog.js';
import { handleAssistantChat } from './src/server/assistant.js';
import { P2PRequest, OrgPosition, ValidationRule } from './src/types.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Load static reference datasets
  const positionsPath = path.resolve(__dirname, 'data', 'org_positions.json');
  const rulesPath = path.resolve(__dirname, 'data', 'validation_rules.json');

  let positions: OrgPosition[] = [];
  let rules: ValidationRule[] = [];

  try {
    positions = JSON.parse(fs.readFileSync(positionsPath, 'utf-8'));
  } catch (err) {
    console.error('Error loading org_positions.json:', err);
  }

  try {
    rules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
  } catch (err) {
    console.error('Error loading validation_rules.json:', err);
  }

  // API Route 1: Smart Pre-Submission Rule Engine
  app.post('/api/pre-validate', (req, res) => {
    try {
      const result = runPreValidation(req.body);

      // Log to audit trail if validation fails or passes
      logAuditEntry({
        caseId: req.body.caseId || 'DRAFT-IN-PROGRESS',
        trackingNumber: req.body.trackingNumber || 'DRAFT-REQUEST',
        actor: req.body.actor || 'Line Manager',
        actorRole: 'System Rule Engine',
        actionType: result.isValid ? 'PRE_VALIDATION_PASSED' : 'PRE_VALIDATION_BLOCKED',
        details: result.isValid
          ? `Pre-submission validation passed for ${req.body.requestType}. All required checks verified.`
          : `Pre-submission validation blocked: ${Object.values(result.errors).join('; ')}`,
        metadata: {
          rulesTriggered: result.ruleResults.filter(r => !r.passed).map(r => r.code)
        }
      });

      res.json(result);
    } catch (error: any) {
      console.error('Error in /api/pre-validate:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route 2: In-Flight Predictive Risk Engine & SHAP Explainability
  app.post('/api/predict-risk', (req, res) => {
    try {
      const risk = predictRisk(req.body);

      logAuditEntry({
        caseId: req.body.caseId || 'INFERENCE-RUN',
        trackingNumber: req.body.trackingNumber || 'P2P-INFERENCE',
        actor: 'XGBoost Risk Classifier v3.4',
        actorRole: 'AI Risk Engine',
        actionType: 'RISK_SCORING_COMPUTED',
        details: `Calculated Return Risk: ${risk.returnRisk}% | Delay Risk: ${risk.delayRisk}% | Tier: ${risk.riskTier}`,
        metadata: {
          returnRisk: risk.returnRisk,
          delayRisk: risk.delayRisk,
          shapSummary: risk.shapValues.slice(0, 2).map(s => `${s.impact > 0 ? '+' : ''}${s.impact}% ${s.displayName}`).join(', ')
        }
      });

      res.json(risk);
    } catch (error: any) {
      console.error('Error in /api/predict-risk:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route 3: Process Mining & Optimization Engine
  app.get('/api/process-analytics', (req, res) => {
    try {
      const analytics = loadAndAnalyzeEventLog();
      res.json(analytics);
    } catch (error: any) {
      console.error('Error in /api/process-analytics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route 4: Immutable Audit Trail Log
  app.get('/api/audit-log', (req, res) => {
    try {
      const { caseId, limit } = req.query;
      let logs = [...inMemoryAuditLog];
      if (caseId) {
        logs = logs.filter(l => l.caseId === caseId || l.trackingNumber === caseId);
      }
      if (limit) {
        logs = logs.slice(0, Number(limit));
      }
      res.json(logs);
    } catch (error: any) {
      console.error('Error in /api/audit-log:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // P2P Requests list
  app.get('/api/requests', (req, res) => {
    try {
      const { status, department, search } = req.query;
      let results = [...inMemoryRequests];

      if (status && status !== 'all') {
        results = results.filter(r => r.status === status);
      }
      if (department && department !== 'all') {
        results = results.filter(r => r.department === department || r.targetDepartment === department);
      }
      if (search) {
        const query = String(search).toLowerCase();
        results = results.filter(r =>
          r.trackingNumber.toLowerCase().includes(query) ||
          r.title.toLowerCase().includes(query) ||
          (r.employeeName && r.employeeName.toLowerCase().includes(query)) ||
          (r.employeeId && r.employeeId.toLowerCase().includes(query))
        );
      }

      res.json(results);
    } catch (error: any) {
      console.error('Error in /api/requests:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Submit new P2P Request
  app.post('/api/requests', (req, res) => {
    try {
      const validation = runPreValidation(req.body);
      if (!validation.isValid) {
        return res.status(400).json({
          error: 'Pre-submission validation failed',
          validation
        });
      }

      const seq = inMemoryRequests.length + 112;
      const id = `REQ-2026-${seq}`;
      const trackingNumber = `P2P-EK-2026-${String(seq).padStart(4, '0')}`;

      // Calculate risk scores
      const riskPrediction = predictRisk({
        requestType: req.body.requestType,
        currentGrade: req.body.currentGrade,
        targetGrade: req.body.targetGrade,
        originDepartment: req.body.department,
        targetDepartment: req.body.targetDepartment || req.body.department,
        hasBudgetApproval: req.body.hasBudgetApproval,
        businessJustification: req.body.businessJustification,
        hasAttachments: req.body.attachments && req.body.attachments.length > 0
      });

      const isExpress = riskPrediction.autoExpressLaneEligible;
      const status = isExpress ? 'Express Lane Synced' : 'In HR Ops Review';
      const currentStepOwner = isExpress
        ? 'ERP Core Synced'
        : 'HR Operations (Initial Triage)';

      const newRequest: P2PRequest = {
        id,
        trackingNumber,
        requestType: req.body.requestType,
        title: req.body.title || `${req.body.requestType} for ${req.body.employeeName || req.body.targetPositionTitle || 'Position'}`,
        status,
        currentStepOwner,
        department: req.body.department,
        targetDepartment: req.body.targetDepartment || req.body.department,
        employeeId: req.body.employeeId,
        employeeName: req.body.employeeName,
        currentPositionId: req.body.currentPositionId,
        currentPositionTitle: req.body.currentPositionTitle,
        currentGrade: req.body.currentGrade ? Number(req.body.currentGrade) : undefined,
        targetPositionId: req.body.targetPositionId,
        targetPositionTitle: req.body.targetPositionTitle,
        targetGrade: req.body.targetGrade ? Number(req.body.targetGrade) : undefined,
        hasBudgetApproval: Boolean(req.body.hasBudgetApproval),
        budgetRefCode: req.body.budgetRefCode || (req.body.hasBudgetApproval ? `BUD-EK-AUTO-${Date.now().toString().slice(-4)}` : undefined),
        businessJustification: req.body.businessJustification,
        attachments: req.body.attachments || [],
        submittedBy: req.body.submittedBy || 'Capt. Tariq Al-Maktoum (Line Manager)',
        submittedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        riskPrediction,
        auditTrailCount: 3
      };

      inMemoryRequests.unshift(newRequest);

      // Audit logs
      logAuditEntry({
        caseId: id,
        trackingNumber,
        actor: newRequest.submittedBy,
        actorRole: 'Line Manager',
        actionType: 'REQUEST_SUBMITTED',
        details: `Line manager submitted ${newRequest.requestType} request. Target: ${newRequest.targetPositionTitle || 'Role'}.`,
        metadata: {
          returnRisk: riskPrediction.returnRisk,
          delayRisk: riskPrediction.delayRisk
        }
      });

      if (isExpress) {
        logAuditEntry({
          caseId: id,
          trackingNumber,
          actor: 'P2P Express Lane Orchestrator',
          actorRole: 'System Rule Engine',
          actionType: 'EXPRESS_LANE_ROUTED',
          details: 'Zero-discrepancy intra-department lateral transfer routed to Express Lane. Auto-synced to Emirates ERP Core.',
          metadata: {
            returnRisk: riskPrediction.returnRisk,
            delayRisk: riskPrediction.delayRisk
          }
        });
      }

      res.status(201).json(newRequest);
    } catch (error: any) {
      console.error('Error submitting request:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Human-in-the-Loop (HITL) Action Handler
  app.post('/api/requests/:id/action', (req, res) => {
    try {
      const { id } = req.params;
      const { action, actor, reason } = req.body; // action: 'Accept' | 'Override' | 'Approve' | 'Return'

      const request = inMemoryRequests.find(r => r.id === id);
      if (!request) {
        return res.status(404).json({ error: 'Request not found' });
      }

      request.hitlActionTaken = {
        action,
        actor: actor || 'HR Ops Specialist',
        reason: reason || 'Review completed per standard operating procedure',
        timestamp: new Date().toISOString()
      };
      request.lastUpdatedAt = new Date().toISOString();
      request.auditTrailCount = (request.auditTrailCount || 1) + 1;

      let auditActionType: any = 'HITL_ACCEPTED_RECOMMENDATION';
      if (action === 'Override') {
        auditActionType = 'HITL_OVERRIDE_FLAGGED';
        request.currentStepOwner = 'HR Operations Lead (Manual Review)';
      } else if (action === 'Approve') {
        auditActionType = 'HR_OPS_APPROVED';
        request.status = 'Approved';
        request.currentStepOwner = 'ERP Position Synced';
      } else if (action === 'Return') {
        auditActionType = 'RETURNED_TO_MANAGER';
        request.status = 'Returned to Manager';
        request.currentStepOwner = 'Line Manager (Awaiting Correction)';
      } else if (action === 'Accept') {
        auditActionType = 'HITL_ACCEPTED_RECOMMENDATION';
        if (request.riskPrediction?.autoExpressLaneEligible) {
          request.status = 'Express Lane Synced';
          request.currentStepOwner = 'ERP Core Synced';
        }
      }

      logAuditEntry({
        caseId: request.id,
        trackingNumber: request.trackingNumber,
        actor: actor || 'HR Ops Reviewer',
        actorRole: 'HR Operations',
        actionType: auditActionType,
        details: `Human-in-the-Loop Decision: [${action}] by ${actor || 'HR Ops Specialist'}. Reason: "${reason || 'No comments specified.'}"`,
        metadata: {
          overrideReason: reason,
          returnRisk: request.riskPrediction?.returnRisk,
          delayRisk: request.riskPrediction?.delayRisk
        }
      });

      res.json({ success: true, request });
    } catch (error: any) {
      console.error('Error handling request action:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Bilingual Conversational Assistant endpoint
  app.post('/api/assistant/chat', async (req, res) => {
    try {
      const response = await handleAssistantChat(req.body);
      res.json(response);
    } catch (error: any) {
      console.error('Error in assistant chat:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Reference data endpoints
  app.get('/api/positions', (req, res) => {
    res.json(positions);
  });

  app.get('/api/rules', (req, res) => {
    res.json(rules);
  });

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      app: 'Emirates Group Right First Time - P2P Operations',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  });

  // Vite middleware in dev or static files in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Emirates Group P2P Engine running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
