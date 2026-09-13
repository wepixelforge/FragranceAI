'use client';

import React, { useState } from 'react';
import { ConsultationDebugInfo } from '@/types/chat';

interface ConsultationDebugPanelProps {
  debugInfo: ConsultationDebugInfo | null;
}

export default function ConsultationDebugPanel({ debugInfo }: ConsultationDebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (process.env.NODE_ENV === 'production' || !debugInfo) {
    return null;
  }

  const {
    userMessage,
    intent,
    isNewRequest,
    isRefinement,
    stateBefore,
    parsedUpdates,
    stateAfter,
    hardConstraints,
    exclusions,
    referencePerfume,
    productRetrievalCalled,
    filteredProductCount,
    candidatesBeforeFilter,
    candidatesAfterHardFilter,
    canonicalProductIds,
    llmProductIds,
    uiProductIds,
    previousProductIds,
    temporaryExcludedProductIds,
    status,
    rankedProductIds,
    matchReasons,
    finalProductIdsSentToLLM,
    finalProductIdsSentToUI,
    hardConstraintFailed,
  } = debugInfo;

  return (
    <div className="border-b border-brand-border bg-neutral-900 text-xs text-neutral-200 font-mono">
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-bold tracking-wider uppercase text-[10px] text-amber-400">
            [QA AUDIT DEBUG]
          </span>
          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-amber-300 font-bold">
            {intent}
          </span>
          <span className="text-[10px] text-neutral-400">
            {isNewRequest ? '⚡ NEW REQUEST' : isRefinement ? '🔄 REFINEMENT' : 'OTHER'}
          </span>
          {hardConstraintFailed && (
            <span className="rounded bg-rose-500/20 px-1 py-0.5 text-[10px] text-rose-400 font-bold">
              CONSTRAINTS BLOCKED
            </span>
          )}
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-[11px] text-neutral-400 hover:text-amber-400 transition-colors"
        >
          {isOpen ? '▲ Collapse Audit Details' : '▼ Inspect 17 Architecture Signals'}
        </button>
      </div>

      {isOpen && (
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-[11px] bg-neutral-950">
          {/* Column 1: Intent & State Transitions */}
          <div className="space-y-2 p-3 rounded bg-neutral-900 border border-neutral-800">
            <div className="font-bold text-amber-400 uppercase text-[10px] border-b border-neutral-800 pb-1">
              1. Intent & Transitions
            </div>
            <div>
              <span className="text-neutral-400">USER MESSAGE:</span>{' '}
              <span className="text-white font-semibold">"{userMessage || 'N/A'}"</span>
            </div>
            <div>
              <span className="text-neutral-400">INTENT:</span>{' '}
              <span className="text-emerald-400">{intent}</span>
            </div>
            <div>
              <span className="text-neutral-400">IS NEW REQUEST?:</span>{' '}
              <span className={isNewRequest ? 'text-cyan-400 font-bold' : 'text-neutral-400'}>
                {String(isNewRequest)}
              </span>
            </div>
            <div>
              <span className="text-neutral-400">IS REFINEMENT?:</span>{' '}
              <span className={isRefinement ? 'text-amber-400 font-bold' : 'text-neutral-400'}>
                {String(isRefinement)}
              </span>
            </div>
            <div>
              <span className="text-neutral-400">PARSED UPDATES:</span>{' '}
              <span className="text-purple-300">
                {parsedUpdates && parsedUpdates.length > 0
                  ? parsedUpdates.map((u) => `${u.field}:${u.operation}=${u.value ?? ''}`).join(', ')
                  : 'none'}
              </span>
            </div>
            <div>
              <span className="text-neutral-400">STATE BEFORE:</span>{' '}
              <pre className="text-[10px] text-neutral-300 bg-neutral-950 p-1.5 rounded overflow-x-auto max-h-24">
                {JSON.stringify(stateBefore || {}, null, 1)}
              </pre>
            </div>
            <div>
              <span className="text-neutral-400">STATE AFTER:</span>{' '}
              <pre className="text-[10px] text-neutral-300 bg-neutral-950 p-1.5 rounded overflow-x-auto max-h-24">
                {JSON.stringify(stateAfter || {}, null, 1)}
              </pre>
            </div>
          </div>

          {/* Column 2: Hard Constraints & Exclusions */}
          <div className="space-y-2 p-3 rounded bg-neutral-900 border border-neutral-800">
            <div className="font-bold text-rose-400 uppercase text-[10px] border-b border-neutral-800 pb-1">
              2. Hard Constraints & Exclusions
            </div>
            <div>
              <span className="text-neutral-400">BUDGET CAP:</span>{' '}
              <span className={hardConstraints?.budget_max ? 'text-emerald-400 font-bold' : 'text-neutral-400'}>
                {hardConstraints?.budget_max ? `≤ ₹${hardConstraints.budget_max}` : 'none (unlimited)'}
              </span>
            </div>
            <div>
              <span className="text-neutral-400">RELATIVE PRICE:</span>{' '}
              <span className="text-cyan-300">{hardConstraints?.relative_price || 'none'}</span>
            </div>
            <div>
              <span className="text-neutral-400">EXCLUDED FAMILIES:</span>{' '}
              <span className="text-rose-400 font-bold">
                {hardConstraints?.excluded_families?.length ? hardConstraints.excluded_families.join(', ') : 'none'}
              </span>
            </div>
            <div>
              <span className="text-neutral-400">EXCLUDED NOTES:</span>{' '}
              <span className="text-rose-400 font-bold">
                {hardConstraints?.excluded_notes?.length ? hardConstraints.excluded_notes.join(', ') : 'none'}
              </span>
            </div>
            <div>
              <span className="text-neutral-400">INTENSITY CAP:</span>{' '}
              <span className="text-white">{hardConstraints?.intensity_cap || 'none'}</span>
            </div>
            <div>
              <span className="text-neutral-400">REFERENCE PERFUME:</span>{' '}
              <span className="text-purple-300">{referencePerfume || 'none'}</span>
            </div>
            <div>
              <span className="text-neutral-400">PERSISTENT EXCLUSIONS:</span>{' '}
              <pre className="text-[10px] text-neutral-300 bg-neutral-950 p-1.5 rounded overflow-x-auto">
                {JSON.stringify(exclusions || {}, null, 1)}
              </pre>
            </div>
          </div>

          {/* Column 3: Retrieval, Ranking & UI Synchronization */}
          <div className="space-y-2 p-3 rounded bg-neutral-900 border border-neutral-800">
            <div className="font-bold text-emerald-400 uppercase text-[10px] border-b border-neutral-800 pb-1">
              3. Synchronization & Grounding
            </div>
            <div>
              <span className="text-neutral-400">PRODUCT RETRIEVAL CALLED?:</span>{' '}
              <span className={productRetrievalCalled ? 'text-emerald-400 font-bold' : 'text-neutral-500'}>
                {String(productRetrievalCalled)}
              </span>
            </div>
            <div>
              <span className="text-neutral-400">FILTERED PRODUCT COUNT:</span>{' '}
              <span className="text-white font-bold">{filteredProductCount ?? 0}</span>
            </div>
            <div>
              <span className="text-neutral-400">RANKED PRODUCT IDS:</span>{' '}
              <span className="text-emerald-300">
                {rankedProductIds?.length ? rankedProductIds.join(' → ') : 'none'}
              </span>
            </div>
            <div>
              <span className="text-neutral-400">MATCH REASONS:</span>{' '}
              <div className="text-[10px] text-neutral-300 bg-neutral-950 p-1.5 rounded max-h-20 overflow-y-auto">
                {matchReasons?.length ? matchReasons.join(' | ') : 'none'}
              </div>
            </div>
            <div className="border-t border-neutral-800 pt-2">
              <span className="text-neutral-400">FINAL SENT TO LLM:</span>{' '}
              <span className="text-sky-300 font-semibold">
                {finalProductIdsSentToLLM?.length ? finalProductIdsSentToLLM.join(', ') : 'none'}
              </span>
            </div>
            <div>
              <span className="text-neutral-400">FINAL SENT TO UI:</span>{' '}
              <span className="text-emerald-300 font-semibold">
                {finalProductIdsSentToUI?.length ? finalProductIdsSentToUI.join(', ') : 'none'}
              </span>
            </div>
            <div>
              <span className="text-neutral-400">SYNCHRONIZED 1:1?:</span>{' '}
              <span
                className={
                  JSON.stringify(finalProductIdsSentToLLM) === JSON.stringify(finalProductIdsSentToUI)
                    ? 'text-emerald-400 font-bold'
                    : 'text-rose-400 font-bold'
                }
              >
                {JSON.stringify(finalProductIdsSentToLLM) === JSON.stringify(finalProductIdsSentToUI)
                  ? 'YES (VERIFIED)'
                  : 'MISMATCH ERROR'}
              </span>
            </div>

            {/* Alternatives Thread Audit */}
            {(intent === 'SHOW_ALTERNATIVES' || (previousProductIds && previousProductIds.length > 0)) && (
              <div className="border-t border-neutral-800 pt-2 space-y-1 bg-neutral-950 p-2 rounded">
                <div className="text-[10px] font-bold text-amber-400 uppercase">
                  Alternatives Thread Audit:
                </div>
                <div>
                  <span className="text-neutral-400">PREVIOUS IDS:</span>{' '}
                  <span className="text-amber-300">
                    {previousProductIds?.length ? previousProductIds.join(', ') : 'none'}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400">EXCLUDED IDS:</span>{' '}
                  <span className="text-rose-300">
                    {temporaryExcludedProductIds?.length ? temporaryExcludedProductIds.join(', ') : 'none'}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400">AFTER HARD FILTER:</span>{' '}
                  <span className="text-sky-300">
                    {candidatesAfterHardFilter?.length ? candidatesAfterHardFilter.join(', ') : '0'}
                  </span>
                </div>
                {status && (
                  <div>
                    <span className="text-neutral-400">STATUS:</span>{' '}
                    <span className={status === 'NO_ALTERNATIVES' ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
                      {status}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-neutral-400">CANONICAL ∩ PREVIOUS = ∅?:</span>{' '}
                  {(() => {
                    const intersection = (canonicalProductIds || []).filter((id) => (previousProductIds || []).includes(id));
                    const passed = intersection.length === 0;
                    return (
                      <span className={passed ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {passed ? 'YES (EMPTY)' : `FAILED (${intersection.join(', ')})`}
                      </span>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
