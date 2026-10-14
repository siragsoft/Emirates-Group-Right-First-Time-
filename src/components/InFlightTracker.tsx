import React, { useState, useEffect } from 'react';
import { P2PRequest, RiskTier } from '../types.js';
import { ShapWaterfall } from './ShapWaterfall.js';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  Search,
  User,
  Building,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  ChevronRight,
  ExternalLink,
  MessageSquare,
  Check,
  RotateCcw,
  Zap,
  Info
} from 'lucide-react';

interface InFlightTrackerProps {
  role: 'manager' | 'hr';
  lang: 'en' | 'ar';
  selectedRequestId?: string | null;
  onSelectRequest?: (reqId: string | null) => void;
  onRefreshNeeded?: () => void;
}

export const InFlightTracker: React.FC<InFlightTrackerProps> = ({
  role,
  lang,
  selectedRequestId,
  onSelectRequest,
  onRefreshNeeded
}) => {
  const isAr = lang === 'ar';

  const [requests, setRequests] = useState<P2PRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeReqId, setActiveReqId] = useState<string | null>(selectedRequestId || null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState<string>('all');

  // HITL Action Dialog State
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    req: P2PRequest | null;
    actionType: 'Accept' | 'Override' | 'Approve' | 'Return';
  }>({
    isOpen: false,
    req: null,
    actionType: 'Accept'
  });
  const [actionReason, setActionReason] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);

  useEffect(() => {
    if (selectedRequestId) {
      setActiveReqId(selectedRequestId);
    }
  }, [selectedRequestId]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (deptFilter !== 'all') params.append('department', deptFilter);
      if (search.trim()) params.append('search', search.trim());

      const res = await fetch(`/api/requests?${params.toString()}`);
      if (res.ok) {
        const data: P2PRequest[] = await res.json();
        setRequests(data);
        if (!activeReqId && data.length > 0) {
          setActiveReqId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load requests', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [statusFilter, deptFilter, search]);

  const handleOpenHitlModal = (req: P2PRequest, actionType: 'Accept' | 'Override' | 'Approve' | 'Return') => {
    let defaultReason = '';
    if (actionType === 'Accept') {
      defaultReason = `Accepted AI recommendation: ${req.riskPrediction?.recommendedAction || 'Proceed under fast-track criteria'}`;
    } else if (actionType === 'Override') {
      defaultReason = 'Human Operator Override: Mitigating operational factors reviewed; risk flags bypassed under VP delegated authority.';
    } else if (actionType === 'Approve') {
      defaultReason = 'Direct Human Approval: Position and person attributes validated for ERP master synchronization.';
    } else if (actionType === 'Return') {
      defaultReason = 'Returned for revision: Grade or budget requirements require line manager correction.';
    }

    setActionReason(defaultReason);
    setActionModal({
      isOpen: true,
      req,
      actionType
    });
  };

  const handleExecuteHitlAction = async () => {
    if (!actionModal.req) return;
    setActionSubmitting(true);
    try {
      const res = await fetch(`/api/requests/${actionModal.req.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: actionModal.actionType,
          actor: role === 'hr' ? 'Fatima Al-Suwaidi (HR Ops Lead)' : 'Line Manager (Originator)',
          reason: actionReason
        })
      });

      if (res.ok) {
        setActionModal({ isOpen: false, req: null, actionType: 'Accept' });
        await fetchRequests();
        if (onRefreshNeeded) onRefreshNeeded();
      }
    } catch (err) {
      console.error('Error executing HITL action', err);
    } finally {
      setActionSubmitting(false);
    }
  };

  // Filter by tier locally
  const filteredRequests = requests.filter(r => {
    if (tierFilter !== 'all' && r.riskPrediction?.riskTier !== tierFilter) {
      return false;
    }
    return true;
  });

  const activeRequest = requests.find(r => r.id === activeReqId) || filteredRequests[0] || null;

  return (
    <div className="space-y-6">
      {/* Top Header & Metrics Strip */}
      <div className="p-4 rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#D71921]">
                Module 2 & 4
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-xs text-slate-500 font-medium">
                XGBoost/LightGBM Risk Radar & Human-In-The-Loop Governance
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">
              In-Flight Predictive Risk Tracker
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Continuous monitoring of active Position-to-Person requests. Two ML risk classifiers project Return Probability (manager ping-pong) and Delay Probability (SLA breach) with additive SHAP explanations.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3 self-start md:self-auto text-xs">
            <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50">
              <span className="text-[11px] text-slate-500 block">In-Flight Cases</span>
              <span className="text-lg font-bold font-mono text-slate-900">{requests.length}</span>
            </div>
            <div className="p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/50">
              <span className="text-[11px] text-emerald-700 block">Express Lane Synced</span>
              <span className="text-lg font-bold font-mono text-emerald-800">
                {requests.filter(r => r.status === 'Express Lane Synced').length}
              </span>
            </div>
            <div className="p-2.5 rounded-lg border border-red-200 bg-red-50/50">
              <span className="text-[11px] text-red-700 block">High Risk / Returned</span>
              <span className="text-lg font-bold font-mono text-red-800">
                {requests.filter(r => r.riskPrediction?.riskTier === 'High' || r.status.includes('Returned')).length}
              </span>
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search case #, employee name, title..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:border-[#D71921] focus:ring-[#D71921]"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
              className="px-2 py-1.5 text-xs rounded border border-slate-300 bg-white"
            >
              <option value="all">All Departments</option>
              <option value="Flight Operations">Flight Operations</option>
              <option value="Airport Operations">Airport Operations</option>
              <option value="Commercial">Commercial</option>
              <option value="Engineering">Engineering</option>
              <option value="HR">HR</option>
            </select>

            <select
              value={tierFilter}
              onChange={e => setTierFilter(e.target.value)}
              className="px-2 py-1.5 text-xs rounded border border-slate-300 bg-white"
            >
              <option value="all">All Risk Tiers</option>
              <option value="Low">Low Risk (&lt; 30%)</option>
              <option value="Medium">Medium Risk (30-65%)</option>
              <option value="High">High Risk (&gt; 65%)</option>
            </select>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-2 py-1.5 text-xs rounded border border-slate-300 bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="In HR Ops Review">In HR Ops Review</option>
              <option value="Finance Budget Review">Finance Budget Review</option>
              <option value="Returned to Manager">Returned to Manager</option>
              <option value="Express Lane Synced">Express Lane Synced</option>
              <option value="Approved">Approved</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main 2-Column Split: Case List (5 cols) & Deep Dive + SHAP (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Case List Column */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 px-1">
            <span>Active Requests ({filteredRequests.length})</span>
            <span>Sorted by SLA Recency</span>
          </div>

          <div className="space-y-2.5 max-h-[720px] overflow-y-auto pr-1">
            {filteredRequests.length === 0 ? (
              <div className="p-8 text-center rounded-xl border border-slate-200 bg-white text-xs text-slate-500">
                No active requests match the selected filters.
              </div>
            ) : (
              filteredRequests.map(req => {
                const isSelected = req.id === activeReqId;
                const risk = req.riskPrediction;
                const tier = risk?.riskTier || 'Low';

                return (
                  <div
                    key={req.id}
                    onClick={() => {
                      setActiveReqId(req.id);
                      if (onSelectRequest) onSelectRequest(req.id);
                    }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#D71921] bg-red-50/30 ring-1 ring-[#D71921] shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-900">
                            {req.trackingNumber}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="text-[11px] text-slate-500 font-medium">
                            {req.requestType}
                          </span>
                        </div>
                        <h4 className="text-xs font-semibold text-slate-800 mt-1 line-clamp-1">
                          {req.title}
                        </h4>
                      </div>

                      {/* Risk Badge */}
                      <div className="text-right shrink-0">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold font-mono tabular-nums border ${
                            tier === 'High'
                              ? 'text-red-700 bg-red-50 border-red-200'
                              : tier === 'Medium'
                              ? 'text-amber-800 bg-amber-50 border-amber-200'
                              : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                          }`}
                        >
                          {risk?.returnRisk}% Ret / {risk?.delayRisk}% Del
                        </span>
                      </div>
                    </div>

                    {/* Step owner and status */}
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                      <span className="truncate max-w-[200px]">
                        Owner: <strong className="text-slate-700">{req.currentStepOwner}</strong>
                      </span>
                      <span
                        className={`font-medium ${
                          req.status === 'Express Lane Synced'
                            ? 'text-emerald-600 font-semibold'
                            : req.status === 'Returned to Manager'
                            ? 'text-red-600 font-bold'
                            : 'text-slate-700'
                        }`}
                      >
                        {req.status}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Case Deep Dive & Tree SHAP Inspection & HITL Actions */}
        <div className="lg:col-span-7 space-y-4">
          {activeRequest ? (
            <div className="p-6 rounded-xl border border-slate-200 bg-white space-y-5">
              {/* Case Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-slate-900">
                      {activeRequest.trackingNumber}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-xs font-semibold text-[#BA9653]">
                      {activeRequest.requestType}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-xs text-slate-500 font-mono">
                      {new Date(activeRequest.submittedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mt-1">
                    {activeRequest.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Submitted by: <strong>{activeRequest.submittedBy}</strong> · Department: {activeRequest.department}
                  </p>
                </div>

                {/* HITL Action Buttons (Human in the Loop) */}
                <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-auto">
                  {role === 'hr' ? (
                    <>
                      <button
                        onClick={() => handleOpenHitlModal(activeRequest, 'Accept')}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                        title="Accept AI risk recommendation and route forward"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Accept AI</span>
                      </button>

                      <button
                        onClick={() => handleOpenHitlModal(activeRequest, 'Override')}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-900 text-white transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                        title="Override AI risk flag with operator justification"
                      >
                        <Zap className="w-3.5 h-3.5 text-[#BA9653]" />
                        <span>Override AI</span>
                      </button>

                      <button
                        onClick={() => handleOpenHitlModal(activeRequest, 'Approve')}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#D71921] hover:bg-[#b5141b] text-white transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                        title="Direct final ERP sync approval"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Approve</span>
                      </button>

                      <button
                        onClick={() => handleOpenHitlModal(activeRequest, 'Return')}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-red-300 text-red-700 hover:bg-red-50 transition-colors flex items-center gap-1 cursor-pointer"
                        title="Return request to Line Manager for correction"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Return</span>
                      </button>
                    </>
                  ) : (
                    <div className="text-right">
                      <span className="text-xs font-medium text-slate-500 block">Current Stage:</span>
                      <span className="text-xs font-bold text-slate-800">{activeRequest.status}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Position & Person Spec Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 text-xs">
                <div>
                  <div className="text-[11px] text-slate-500 font-semibold mb-1">ORIGIN OCCUPANT & ROLE</div>
                  <div className="space-y-0.5">
                    <div>
                      <span className="text-slate-500">Employee: </span>
                      <strong className="text-slate-900">
                        {activeRequest.employeeName || activeRequest.employeeId || 'Vacant / New'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Current Title: </span>
                      <span className="text-slate-800">{activeRequest.currentPositionTitle || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Grade: </span>
                      <span className="font-mono font-bold text-slate-900">
                        Grade {activeRequest.currentGrade ?? 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-slate-500 font-semibold mb-1">TARGET ASSIGNMENT</div>
                  <div className="space-y-0.5">
                    <div>
                      <span className="text-slate-500">Target Role: </span>
                      <strong className="text-slate-900">
                        {activeRequest.targetPositionTitle || 'New Role'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Target Dept: </span>
                      <span className="text-slate-800">{activeRequest.targetDepartment}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Target Grade: </span>
                      <span className="font-mono font-bold text-slate-900">
                        Grade {activeRequest.targetGrade ?? 'N/A'}
                      </span>
                      {activeRequest.currentGrade != null && activeRequest.targetGrade != null && (
                        <span className="ml-1 text-[11px] text-slate-500 font-mono">
                          (Δ {activeRequest.targetGrade - activeRequest.currentGrade})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Business Justification Block */}
              <div className="text-xs space-y-1">
                <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                  Business Justification (Rule-01 Verified)
                </span>
                <p className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 leading-relaxed font-sans">
                  "{activeRequest.businessJustification}"
                </p>
              </div>

              {/* SHAP Waterfall Explainability Section */}
              {activeRequest.riskPrediction && (
                <div className="pt-2 border-t border-slate-200">
                  <div className="mb-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-[#D71921]" />
                      <span>XGBoost Classifier Risk Inference & SHAP Decomposition</span>
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Additive feature impacts explain why this request received its Return Risk and Delay Risk scores.
                    </p>
                  </div>

                  <ShapWaterfall
                    shapValues={activeRequest.riskPrediction.shapValues}
                    returnRisk={activeRequest.riskPrediction.returnRisk}
                    delayRisk={activeRequest.riskPrediction.delayRisk}
                    riskTier={activeRequest.riskPrediction.riskTier}
                    recommendedAction={activeRequest.riskPrediction.recommendedAction}
                    autoExpressLaneEligible={activeRequest.riskPrediction.autoExpressLaneEligible}
                    predictedCycleDays={activeRequest.riskPrediction.predictedCycleDays}
                    compact={false}
                  />
                </div>
              )}

              {/* Recorded Human-in-the-Loop Decision if one exists */}
              {activeRequest.hitlActionTaken && (
                <div className="p-3 rounded-lg bg-slate-900 text-white text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#BA9653] flex items-center gap-1">
                      <ShieldCheck className="w-4 h-4" />
                      Recorded Human Decision: [{activeRequest.hitlActionTaken.action}]
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(activeRequest.hitlActionTaken.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-slate-300">
                    Decision by <strong>{activeRequest.hitlActionTaken.actor}</strong>: "{activeRequest.hitlActionTaken.reason}"
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 text-center rounded-xl border border-slate-200 bg-white text-xs text-slate-500">
              Select an in-flight request to inspect its risk scores and SHAP explainability.
            </div>
          )}
        </div>
      </div>

      {/* Human-in-the-Loop Confirmation Modal */}
      {actionModal.isOpen && actionModal.req && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#D71921]" />
                <h3 className="text-sm font-bold text-slate-900">
                  Human-in-the-Loop Decision: {actionModal.actionType} Action
                </h3>
              </div>
              <button
                onClick={() => setActionModal({ isOpen: false, req: null, actionType: 'Accept' })}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-2">
              <p>
                You are executing a binding human governance action on{' '}
                <strong className="text-slate-900">{actionModal.req.trackingNumber}</strong> (
                {actionModal.req.title}).
              </p>
              <div className="p-2.5 rounded bg-slate-50 border border-slate-200 font-mono text-[11px]">
                Current Risk: {actionModal.req.riskPrediction?.returnRisk}% Return /{' '}
                {actionModal.req.riskPrediction?.delayRisk}% Delay ({actionModal.req.riskPrediction?.riskTier} Tier)
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Operator Rationale & Audit Justification *
              </label>
              <textarea
                rows={3}
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
                placeholder="State reason for accepting, overriding or returning this request..."
                className="w-full p-2.5 text-xs rounded-lg border border-slate-300 focus:border-[#D71921] focus:ring-[#D71921]"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                This decision is logged to the immutable Emirates Group audit ledger with timestamp and identity.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActionModal({ isOpen: false, req: null, actionType: 'Accept' })}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionSubmitting || !actionReason.trim()}
                onClick={handleExecuteHitlAction}
                className="px-4 py-2 text-xs font-bold text-white bg-[#D71921] hover:bg-[#b5141b] rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {actionSubmitting ? 'Recording Action...' : `Confirm [${actionModal.actionType}]`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
