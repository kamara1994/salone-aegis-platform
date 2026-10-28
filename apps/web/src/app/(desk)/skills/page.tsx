'use client';

import Link from 'next/link';
import { useSkills } from '@/api/hooks';
import type { SkillScore } from '@/api/types';
import { Badge, cx, Pane, QueryView } from '@/components/ui';

const DOMAIN: Record<SkillScore['domain'], string> = { networking: 'Networking', identity: 'Identity', endpoint: 'Operations', security_ops: 'Security operations', cloud: 'Cloud', communication: 'Communication', interview: 'Interviews' };
const LEVEL = ['Not started', 'Studied', 'Proven once', 'Proven', 'Strong', 'Expert'];

export default function SkillsPage() {
  const q = useSkills();
  return (
    <div className="space-y-3 p-4">
      <div>
        <h1 className="text-[18px] font-semibold">Skill tree</h1>
        <p className="max-w-3xl text-[13px] text-muted">Levels come only from closed tickets, verified fixes and debrief scores, not from studying. Each skill links to the evidence that proves it. Gaps show what the scheduler sends you next.</p>
      </div>
      <QueryView q={q}>
        {(skills) => (
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {Object.entries(DOMAIN).map(([d, label]) => {
              const list = skills.filter((s) => s.domain === d);
              if (!list.length) return null;
              return (
                <Pane key={d} title={label}>
                  <ul className="divide-y divide-line">
                    {list.map((s) => (
                      <li key={s.skill} className="px-3 py-2.5 text-[13px]">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{s.skill}</span>
                          <span className="ml-auto text-[12px] text-muted">{LEVEL[s.level]}</span>
                        </div>
                        <div className="mt-1.5 flex gap-1" aria-label={`Level ${s.level} of 5`}>
                          {[1, 2, 3, 4, 5].map((i) => (
                            <span key={i} className={cx('h-1.5 flex-1 rounded', i <= s.level ? (s.level >= 4 ? 'bg-healthy' : 'bg-action') : 'bg-pane-2')} />
                          ))}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          {s.frameworks?.map((f) => <Badge key={f}>{f}</Badge>)}
                          <span className="ml-auto text-[12px] text-muted">
                            {s.evidence_ids.length ? (
                              <Link className="text-action hover:underline" href={`/evidence?ticket=${s.evidence_ids.at(-1)}`}>
                                {s.evidence_ids.length} ticket{s.evidence_ids.length > 1 ? 's' : ''} of evidence
                              </Link>
                            ) : s.level === 0 ? (
                              'Arrives with the CCNP backbone and AWS releases'
                            ) : (
                              'No evidence yet'
                            )}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Pane>
              );
            })}
          </div>
        )}
      </QueryView>
    </div>
  );
}
