import { startTransition, useDeferredValue, useMemo, useState } from 'react';
import { siteContent } from '../../content';
import { REQUEST_HINTS, REQUEST_TYPES } from '../../app/constants';
import { getStatusTone } from '../../app/utils';

/* ─── Generation label helpers ─── */

const GEN_LABELS = ['', 'Founders', 'Children', 'Grandchildren', 'Great-grandchildren'];

function getGenLabel(n) {
  if (GEN_LABELS[n]) return GEN_LABELS[n];
  if (n === 5) return '2nd Great-grandchildren';
  if (n === 6) return '3rd Great-grandchildren';
  return `Generation ${n}`;
}

function buildArchiveSummary(member, branchLabel, education) {
  const summary = [
    `${member.displayName} is listed in the ${branchLabel ?? 'family'} archive.`,
    member.generationLevel
      ? `This record is grouped in Generation ${member.generationLevel} (${getGenLabel(member.generationLevel)}).`
      : null,
    member.coParentLabel ? `Parent listing: ${member.coParentLabel}.` : null,
    member.datesLabel ? `Archive dates: ${member.datesLabel}.` : null,
    education.length
      ? `${education.length} education ${education.length === 1 ? 'record is' : 'records are'} linked to this member.`
      : 'No education records are linked to this member yet.',
  ].filter(Boolean);

  return summary.join(' ');
}

function selectBranchMilestones(records) {
  if (!records.length) {
    return { firstRecord: null, latestRecord: null };
  }

  const sorted = [...records].sort((left, right) => {
    const leftYear = left.graduationYear ?? -1;
    const rightYear = right.graduationYear ?? -1;

    if (leftYear !== rightYear) {
      return leftYear - rightYear;
    }

    return (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
  });

  return {
    firstRecord: sorted[0],
    latestRecord: sorted[sorted.length - 1],
  };
}

/* ─── Member Modal ─── */

function MemberModal({ member, education, founderBio, branchLabel, summaryText, onClose, onSubmitUpdate }) {
  if (!member) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="modal-header">
          <span className="modal-gen-label">
            Generation {member.generationLevel ?? '—'} &mdash; {getGenLabel(member.generationLevel ?? 0)}
          </span>
          <h2 className="modal-name">{member.displayName}</h2>
          {branchLabel ? <p className="modal-branch">{branchLabel}</p> : null}
          {member.coParentLabel ? <p className="modal-parents">Parents: {member.coParentLabel}</p> : null}
          {member.datesLabel ? <p className="modal-dates">{member.datesLabel}</p> : null}
        </div>

        <div className="modal-section">
          <h3 className="modal-section-title">Archive Summary</h3>
          <p className="modal-bio-para">{summaryText}</p>
        </div>

        {founderBio && founderBio.length > 0 ? (
          <div className="modal-section">
            <h3 className="modal-section-title">Biography</h3>
            {founderBio.map((para) => (
              <p key={para} className="modal-bio-para">{para}</p>
            ))}
          </div>
        ) : null}

        {education.length > 0 ? (
          <div className="modal-section">
            <h3 className="modal-section-title">Education</h3>
            <div className="modal-edu-list">
              {education.map((rec) => (
                <div className="modal-edu-row" key={rec.id}>
                  <span className="modal-edu-cred">{rec.credentialSummary}</span>
                  {rec.graduationYear ? (
                    <span className="modal-edu-year">{rec.graduationYear}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="modal-footer">
          <p className="modal-footer-note">
            No public contact is attached to this record yet. Use the family update desk to add context, request corrections,
            or share contact details for {member.displayName.split(' ')[0]}.
          </p>
          <button
            className="primary-button modal-update-btn"
            type="button"
            onClick={() => onSubmitUpdate(member)}
          >
            Submit an Update
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── MemberRow — recursive tree node ─── */

function MemberRow({ member, childrenByParentId, eduByMemberId, depth, onMemberClick }) {
  const [expanded, setExpanded] = useState(false);
  const children = childrenByParentId.get(member.id) ?? [];
  const hasChildren = children.length > 0;
  const memberEdu = eduByMemberId.get(member.id) ?? [];

  return (
    <div className="tree-node" data-depth={depth}>
      <div className="tree-node-row">
        {depth > 0 ? <span className="tree-indent" aria-hidden="true" /> : null}

        <button
          className="tree-node-name-btn"
          type="button"
          onClick={() => onMemberClick(member)}
        >
          {member.displayName}
        </button>

        {member.coParentLabel ? <span className="tree-node-parents">Parents: {member.coParentLabel}</span> : null}

        {member.datesLabel ? <span className="tree-node-dates">{member.datesLabel}</span> : null}

        {memberEdu.length > 0 ? (
          <span className="tree-edu-badge" title={memberEdu.map((e) => e.credentialSummary).join('; ')}>
            🎓 {memberEdu.length}
          </span>
        ) : null}

        {hasChildren ? (
          <button
            className="tree-node-toggle"
            type="button"
            onClick={() => setExpanded((x) => !x)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '−' : `+${children.length}`}
          </button>
        ) : null}
      </div>

      {expanded && children.length > 0 ? (
        <div className="tree-node-children">
          {children.map((child) => (
            <MemberRow
              key={child.id}
              member={child}
              childrenByParentId={childrenByParentId}
              eduByMemberId={eduByMemberId}
              depth={depth + 1}
              onMemberClick={onMemberClick}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ─── GenerationGroup ─── */

function GenerationGroup({
  genLevel,
  latestGeneration,
  members,
  childrenByParentId,
  eduByMemberId,
  searchQuery,
  onMemberClick,
}) {
  const defaultOpen = genLevel === latestGeneration || (latestGeneration > 1 && genLevel === 2);
  const [open, setOpen] = useState(defaultOpen);

  const visible = useMemo(() => {
    if (!searchQuery) return members;
    const q = searchQuery.toLowerCase();
    return members.filter((m) => m.displayName.toLowerCase().includes(q));
  }, [members, searchQuery]);

  const eduCount = useMemo(
    () => members.reduce((sum, m) => sum + (eduByMemberId.get(m.id)?.length ?? 0), 0),
    [members, eduByMemberId],
  );

  const generationEducation = useMemo(() => {
    const source = searchQuery ? visible : members;
    return source.flatMap((member) => eduByMemberId.get(member.id) ?? []);
  }, [eduByMemberId, members, searchQuery, visible]);

  const isOpen = searchQuery ? true : open;

  if (searchQuery && visible.length === 0) return null;

  return (
    <div className="gen-group">
      <button className="gen-group-toggle" type="button" onClick={() => setOpen((x) => !x)}>
        <span className="gen-group-label">
          Gen {genLevel} &mdash; {getGenLabel(genLevel)}
        </span>
        <span className="gen-group-right">
          {eduCount > 0 ? <span className="gen-edu-count">🎓 {eduCount}</span> : null}
          <span className="gen-group-count">{visible.length} people</span>
          <span className="gen-group-caret">{isOpen ? '▲' : '▼'}</span>
        </span>
      </button>

      {isOpen ? (
        <div className="gen-group-members">
          {visible.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              childrenByParentId={childrenByParentId}
              eduByMemberId={eduByMemberId}
              depth={0}
              onMemberClick={onMemberClick}
            />
          ))}

          {generationEducation.length > 0 ? (
            <div className="gen-group-education">
              <div className="gen-education-heading">Education In This Generation</div>
              <div className="gen-education-list">
                {generationEducation.map((record) => (
                  <div className="gen-education-row" key={record.id}>
                    <strong>{record.memberName}</strong>
                    <span>{record.credentialSummary}</span>
                    {record.graduationYear ? <em>{record.graduationYear}</em> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ─── BranchTreePanel ─── */

function BranchTreePanel({ members, memberSearch, onMemberSearch, branchEducation, onMemberClick }) {
  const deferredSearch = useDeferredValue(memberSearch);

  // Build parent→children index
  const childrenByParentId = useMemo(() => {
    const map = new Map();
    for (const m of members) {
      if (m.parentMemberId) {
        if (!map.has(m.parentMemberId)) map.set(m.parentMemberId, []);
        map.get(m.parentMemberId).push(m);
      }
    }
    return map;
  }, [members]);

  // Build member→education index
  const eduByMemberId = useMemo(() => {
    const map = new Map();
    for (const rec of branchEducation) {
      if (rec.memberId) {
        if (!map.has(rec.memberId)) map.set(rec.memberId, []);
        map.get(rec.memberId).push(rec);
      }
    }
    return map;
  }, [branchEducation]);

  // Group by generation level, sorted
  const generations = useMemo(() => {
    const groups = new Map();
    for (const m of members) {
      const gen = m.generationLevel ?? 1;
      if (!groups.has(gen)) groups.set(gen, []);
      groups.get(gen).push(m);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => {
        if (a.isBranchFounder) return -1;
        if (b.isBranchFounder) return 1;
        return a.displayName.localeCompare(b.displayName);
      });
    }
    return [...groups.entries()].sort(([a], [b]) => a - b);
  }, [members]);

  const latestGeneration = generations[generations.length - 1]?.[0] ?? 1;
  const branchKey = members[0]?.branchId ?? 'branch';

  return (
    <>
      <div className="panel-header">
        <h4>Family Tree</h4>
        <input
          className="filter-input"
          type="search"
          value={memberSearch}
          onChange={onMemberSearch}
          placeholder="Search members…"
        />
      </div>

      {generations.length === 0 ? (
        <div className="empty-note">No members in this branch yet.</div>
      ) : (
        <div className="gen-groups">
          {generations.map(([genLevel, genMembers]) => (
            <GenerationGroup
              key={`${branchKey}-${genLevel}`}
              genLevel={genLevel}
              latestGeneration={latestGeneration}
              members={genMembers}
              childrenByParentId={childrenByParentId}
              eduByMemberId={eduByMemberId}
              searchQuery={deferredSearch}
              onMemberClick={onMemberClick}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ApplicationCreditCard({ appCredits }) {
  return (
    <article className="panel-card credit-card">
      <span className="section-label">Family Development</span>
      <h4>{appCredits.title}</h4>
      {appCredits.callout ? <div className="credit-callout">{appCredits.callout}</div> : null}
      <p className="credit-summary">{appCredits.summary}</p>
      <a className="credit-link" href={appCredits.websiteHref} target="_blank" rel="noreferrer">
        {appCredits.websiteLabel}
      </a>
      <div className="credit-role-grid">
        {appCredits.roles.map((person) => (
          <div className="credit-role-card" key={person.name}>
            <strong>{person.name}</strong>
            <span>{person.role}</span>
            <p>{person.note}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

/* ─── Global Member Search ─── */

function GlobalSearch({ hubData, onBranchSelect }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q || q.length < 2) return [];
    return hubData.members
      .filter((m) => m.displayName.toLowerCase().includes(q))
      .slice(0, 20);
  }, [hubData.members, query]);

  const branchById = useMemo(
    () => new Map(hubData.branches.map((b) => [b.id, b])),
    [hubData.branches],
  );

  function handleSelect(member) {
    startTransition(() => onBranchSelect(member.branchId));
    setQuery('');
    setOpen(false);
    setTimeout(() => {
      document.getElementById('branches')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }

  return (
    <div className="global-search">
      <div className="global-search-bar">
        <span className="global-search-icon">🔍</span>
        <input
          className="global-search-input"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search any family member across all 17 branches…"
        />
      </div>

      {open && results.length > 0 ? (
        <div className="global-search-results">
          {results.map((member) => {
            const branch = branchById.get(member.branchId);
            return (
              <button
                className="search-result-row"
                key={member.id}
                type="button"
                onClick={() => handleSelect(member)}
              >
                <span className="search-result-name">{member.displayName}</span>
                <span className="search-result-branch">{branch?.displayName ?? 'Unknown branch'}</span>
                <span className="search-result-gen">Gen {member.generationLevel ?? '?'}</span>
              </button>
            );
          })}
        </div>
      ) : open && query.length >= 2 && results.length === 0 ? (
        <div className="global-search-results">
          <div className="search-no-results">No members found for "{query}"</div>
        </div>
      ) : null}
    </div>
  );
}

/* ─── Public Header ─── */

function PublicHeader() {
  return (
    <header className="shell-header">
      <a className="shell-brand" href="#top">
        P.B. Hines Foundation
      </a>
      <nav className="shell-nav" aria-label="Primary">
        <a href="#legacy">Legacy</a>
        <a href="#branches">Branches</a>
        <a href="#education">Education</a>
        <a href="#contribute">Contribute</a>
        <a href="/?view=admin">Admin</a>
      </nav>
    </header>
  );
}

/* ─── Hero ─── */

function HeroSection({ hubData, hubStatus, onBranchSelect }) {
  return (
    <section className="hero-shell" id="top">
      <div className="hero-copy">
        <p className="hero-eyebrow">{siteContent.hero.eyebrow}</p>
        <h1>
          {siteContent.hero.title}
          <span>{siteContent.hero.accentTitle}</span>
        </h1>
        <p className="hero-subtitle">{siteContent.hero.subtitle}</p>
        <div className={`status-pill ${getStatusTone(hubStatus.kind)}`}>
          <strong>{hubStatus.kind === 'live' ? 'Live archive' : 'Archive fallback'}</strong>
          <span>{hubStatus.message}</span>
        </div>
      </div>

      <div className="hero-data-grid">
        <article className="metric-card">
          <strong>{hubData.summaryStats.branches}</strong>
          <span>Branch lines</span>
        </article>
        <article className="metric-card">
          <strong>{hubData.summaryStats.members}</strong>
          <span>Members in archive</span>
        </article>
        <article className="metric-card">
          <strong>{hubData.summaryStats.education}</strong>
          <span>Education records</span>
        </article>
        <article className="metric-card quote-card">
          <p>{siteContent.hero.quote}</p>
          <span>Family motto</span>
        </article>
      </div>

      <div className="hero-search-wrap">
        <GlobalSearch hubData={hubData} onBranchSelect={onBranchSelect} />
      </div>
    </section>
  );
}

/* ─── Legacy ─── */

function LegacySection() {
  return (
    <section className="legacy-shell" id="legacy">
      <div className="legacy-grid">
        <div className="legacy-copy">
          <div className="section-heading">
            <span className="section-label">{siteContent.legacy.label}</span>
            <h2>
              {siteContent.legacy.title} <em>{siteContent.legacy.accentTitle}</em>{' '}
              {siteContent.legacy.trailingTitle}
            </h2>
          </div>
          {siteContent.legacy.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>

        <div className="legacy-stats-grid">
          {siteContent.legacy.stats.map((stat) => (
            <article className="legacy-stat" key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Branch Explorer ─── */

function BranchExplorer({
  hubData,
  activeBranch,
  branchMembers,
  branchEducation,
  memberSearch,
  onBranchSelect,
  onMemberSearch,
  onMemberSelect,
}) {
  return (
    <section className="branches-shell" id="branches">
      <div className="section-heading">
        <span className="section-label">Live Archive</span>
        <h2>
          Explore All <em>{hubData.branches.length} Branches</em>
        </h2>
      </div>

      {/* All 17 branch pills — always fully visible */}
      <div className="branch-pill-grid">
        {hubData.branches.map((branch) => (
          <button
            className={`branch-pill ${activeBranch?.id === branch.id ? 'is-active' : ''}`}
            key={branch.id}
            type="button"
            onClick={() => {
              startTransition(() => onBranchSelect(branch.id));
            }}
          >
            <span className="branch-pill-num">Tree {branch.treeNumber}</span>
            <span className="branch-pill-name">{branch.displayName}</span>
            <span className="branch-pill-meta">{branch.memberCount} · {branch.educationCount}🎓</span>
          </button>
        ))}
      </div>

      {/* Branch detail */}
      {activeBranch ? (
        <div className="branch-detail">
          <div className="branch-detail-header">
            <div>
              <span className="section-label">Selected Branch</span>
              <h3>{activeBranch.displayName}</h3>
              <p>{activeBranch.datesLabel ?? 'Dates pending verification'}</p>
            </div>
            <div className="branch-detail-badges">
              <span>Founder: {activeBranch.founderName}</span>
              <span>{activeBranch.memberCount} members</span>
              <span>{activeBranch.educationCount} education records</span>
            </div>
          </div>

          <div className="branch-story-grid">
            <article className="panel-card">
              <h4>Founder Biography</h4>
              {(activeBranch.biography.length ? activeBranch.biography : ['No biography available yet.']).map(
                (paragraph) => <p key={paragraph}>{paragraph}</p>,
              )}
              {activeBranch.quote ? (
                <blockquote className="branch-quote">{activeBranch.quote}</blockquote>
              ) : null}
            </article>

            <article className="panel-card">
              <BranchTreePanel
                members={branchMembers}
                memberSearch={memberSearch}
                onMemberSearch={onMemberSearch}
                branchEducation={branchEducation}
                onMemberClick={onMemberSelect}
              />
            </article>
          </div>

          {branchEducation.length > 0 ? (
            <article className="panel-card branch-edu-panel">
              <h4>Education — {activeBranch.displayName}</h4>
              <div className="branch-edu-grid">
                {branchEducation.map((record) => (
                  <div className="branch-edu-row" key={record.id}>
                    <strong>{record.memberName}</strong>
                    <p>{record.credentialSummary}</p>
                    {record.graduationYear ? <span>{record.graduationYear}</span> : null}
                  </div>
                ))}
              </div>
            </article>
          ) : null}

        </div>
      ) : (
        <div className="branch-detail-empty">
          <p>Select a branch above to explore the family tree.</p>
        </div>
      )}
    </section>
  );
}

/* ─── Education Section ─── */

function EducationSection({ education }) {
  const byBranch = useMemo(() => {
    const groups = new Map();
    for (const record of education) {
      const key = record.branchSlug ?? record.branchLabel ?? 'other';
      if (!groups.has(key)) {
        groups.set(key, { label: record.branchLabel, records: [] });
      }
      groups.get(key).records.push(record);
    }
    return [...groups.values()].sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));
  }, [education]);

  return (
    <section className="education-shell" id="education">
      <div className="section-heading">
        <span className="section-label">{siteContent.education.label}</span>
        <h2>
          {siteContent.education.title} <em>{siteContent.education.accentTitle}</em>
        </h2>
      </div>

      <div className="education-layout">
        <article className="panel-card emphasis-card">
          <p>{siteContent.education.intro}</p>
          {siteContent.education.highlights.map((highlight) => (
            <blockquote key={highlight}>{highlight}</blockquote>
          ))}
          <p>{siteContent.education.summary}</p>
        </article>

        <div className="edu-branches">
          {byBranch.map(({ label, records }) => (
            <div className="edu-branch-group" key={label}>
              {(() => {
                const { firstRecord, latestRecord } = selectBranchMilestones(records);

                return (
                  <>
                    <div className="edu-branch-milestones">
                      {firstRecord ? (
                        <div className="edu-milestone-card">
                          <span>First Visible Scholar</span>
                          <strong>{firstRecord.memberName}</strong>
                          <p>{firstRecord.credentialSummary}</p>
                        </div>
                      ) : null}
                      {latestRecord ? (
                        <div className="edu-milestone-card">
                          <span>Latest Or Current Scholar</span>
                          <strong>{latestRecord.memberName}</strong>
                          <p>{latestRecord.credentialSummary}</p>
                        </div>
                      ) : null}
                    </div>
                  </>
                );
              })()}
              <h4 className="edu-branch-label">{label}</h4>
              <div className="edu-branch-list">
                {records.map((record) => (
                  <div className="edu-record-row" key={record.id}>
                    <span className="edu-record-name">{record.memberName}</span>
                    <span className="edu-record-cred">{record.credentialSummary}</span>
                    {record.graduationYear ? (
                      <span className="edu-record-year">{record.graduationYear}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {byBranch.length === 0 ? (
            <div className="empty-note">No education records available yet.</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* ─── Update Center ─── */

function UpdateCenter({ hubData, availableMembers, formState, submitState, canSubmit, onFieldChange, onSubmit }) {
  return (
    <section className="contribute-shell" id="contribute">
      <div className="section-heading">
        <span className="section-label">Family Update Center</span>
        <h2>
          Keep The Archive <em>Alive</em>
        </h2>
      </div>

      <div className="contribute-layout">
        <article className="panel-card process-card">
          <h3>How The Flow Works</h3>
          <ol className="flow-list">
            <li>Family members submit new people, graduations, locations, and corrections from the public site.</li>
            <li>Requests land in the admin review desk for validation and branch placement.</li>
            <li>Approved additive changes extend the live archive without rewriting the seeded branch baseline.</li>
          </ol>

          <div className="request-type-grid">
            {REQUEST_TYPES.map((type) => (
              <article className="request-type-card" key={type.value}>
                <h4>{type.label}</h4>
                <p>{REQUEST_HINTS[type.value]}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="panel-card form-card">
          <h3>Submit A Family Update</h3>
          <form className="update-form" onSubmit={onSubmit}>
            <div className="form-grid">
              <label className="form-field">
                <span>Request type</span>
                <select name="requestType" value={formState.requestType} onChange={onFieldChange}>
                  {REQUEST_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Branch</span>
                <select name="branchId" value={formState.branchId} onChange={onFieldChange}>
                  <option value="">Select a branch</option>
                  {hubData.branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.displayName}</option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Your name</span>
                <input name="requesterName" type="text" value={formState.requesterName}
                  onChange={onFieldChange} placeholder="Full name" required />
              </label>

              <label className="form-field">
                <span>Email</span>
                <input name="requesterEmail" type="email" value={formState.requesterEmail}
                  onChange={onFieldChange} placeholder="you@example.com" required />
              </label>

              <label className="form-field">
                <span>Phone</span>
                <input name="requesterPhone" type="tel" value={formState.requesterPhone}
                  onChange={onFieldChange} placeholder="Optional" />
              </label>

              <label className="form-field">
                <span>Relationship to family</span>
                <input name="relationshipToFamily" type="text" value={formState.relationshipToFamily}
                  onChange={onFieldChange} placeholder="Grandchild, cousin, branch member" />
              </label>

              <label className="form-field form-field-wide">
                <span>Linked member</span>
                <select name="memberId" value={formState.memberId} onChange={onFieldChange}>
                  <option value="">Select a member</option>
                  {availableMembers.map((member) => (
                    <option key={member.id} value={member.id}>{member.displayName}</option>
                  ))}
                </select>
              </label>

              <label className="form-field form-field-wide">
                <span>Proposed name or branch extension</span>
                <input name="proposedName" type="text" value={formState.proposedName}
                  onChange={onFieldChange} placeholder="Person or branch-head being added or corrected" />
              </label>

              <label className="form-field form-field-wide">
                <span>Subject</span>
                <input name="subject" type="text" value={formState.subject}
                  onChange={onFieldChange} placeholder="Optional, auto-generated if left blank" />
              </label>

              <label className="form-field">
                <span>Current location</span>
                <input name="currentLocation" type="text" value={formState.currentLocation}
                  onChange={onFieldChange} placeholder="City, state, or region" />
              </label>

              <label className="form-field">
                <span>Education details</span>
                <input name="educationDetails" type="text" value={formState.educationDetails}
                  onChange={onFieldChange} placeholder="School, degree, year, honors" />
              </label>

              <label className="form-field form-field-wide">
                <span>Update details</span>
                <textarea name="message" value={formState.message} onChange={onFieldChange}
                  rows={6} placeholder={REQUEST_HINTS[formState.requestType]} required />
              </label>

              <label className="form-field form-field-wide">
                <span>Evidence URLs</span>
                <textarea name="evidenceUrls" value={formState.evidenceUrls} onChange={onFieldChange}
                  rows={3} placeholder="One URL per line for scans, photos, documents, or school pages" />
              </label>
            </div>

            <div className={`status-banner ${submitState.status}`}>
              <strong>{canSubmit ? 'Submission pipeline ready' : 'Submission pipeline needs setup'}</strong>
              <span>
                {submitState.message ||
                  (canSubmit
                    ? 'Requests will enter the Hines review queue.'
                    : 'The public API wrappers are not fully ready for write actions yet.')}
              </span>
            </div>

            <button className="primary-button" type="submit" disabled={submitState.status === 'submitting' || !canSubmit}>
              {submitState.status === 'submitting' ? 'Submitting…' : 'Send Family Update'}
            </button>
          </form>
        </article>
      </div>
    </section>
  );
}

/* ─── PublicPage ─── */

export function PublicPage({
  hubData,
  hubStatus,
  activeBranch,
  branchMembers,
  branchEducation,
  memberSearch,
  formState,
  availableMembers,
  submitState,
  canSubmit,
  onBranchSelect,
  onMemberSearch,
  onFieldChange,
  onSubmit,
  onPrefillMemberUpdate,
}) {
  const [modalMember, setModalMember] = useState(null);
  const appCredits = siteContent.appCredits;
  const branchById = useMemo(() => new Map(hubData.branches.map((branch) => [branch.id, branch])), [hubData.branches]);

  // Derive education and bio for modal
  const modalEducation = useMemo(() => {
    if (!modalMember) return [];
    return branchEducation.filter((rec) => rec.memberId === modalMember.id);
  }, [modalMember, branchEducation]);

  const modalBranch = useMemo(() => {
    if (!modalMember) {
      return null;
    }

    return branchById.get(modalMember.branchId) ?? activeBranch ?? null;
  }, [activeBranch, branchById, modalMember]);

  const modalBio = useMemo(() => {
    if (!modalMember) return null;
    if (modalMember.isBranchFounder && activeBranch?.biography?.length) {
      return activeBranch.biography;
    }
    return null;
  }, [modalMember, activeBranch]);

  const modalSummary = useMemo(() => {
    if (!modalMember) {
      return '';
    }

    return buildArchiveSummary(modalMember, modalBranch?.displayName, modalEducation);
  }, [modalBranch?.displayName, modalEducation, modalMember]);

  function handleSubmitUpdate(member) {
    setModalMember(null);
    onPrefillMemberUpdate?.(member);
    // Scroll to contribute and pre-populate branch
    setTimeout(() => {
      document.getElementById('contribute')?.scrollIntoView({ behavior: 'smooth' });
    }, 150);
  }

  return (
    <main className="public-shell">
      <PublicHeader />
      <HeroSection hubData={hubData} hubStatus={hubStatus} onBranchSelect={onBranchSelect} />
      <LegacySection />
      <BranchExplorer
        hubData={hubData}
        activeBranch={activeBranch}
        branchMembers={branchMembers}
        branchEducation={branchEducation}
        memberSearch={memberSearch}
        onBranchSelect={onBranchSelect}
        onMemberSearch={onMemberSearch}
        onMemberSelect={setModalMember}
      />
      <section className="credit-shell" id="family-development">
        <div className="credit-layout">
          <ApplicationCreditCard appCredits={appCredits} />
        </div>
      </section>
      <EducationSection education={hubData.education} />
      <UpdateCenter
        hubData={hubData}
        availableMembers={availableMembers}
        formState={formState}
        submitState={submitState}
        canSubmit={canSubmit}
        onFieldChange={onFieldChange}
        onSubmit={onSubmit}
      />
      <footer className="shell-footer">
        <p>{siteContent.motto.quote}</p>
        <span>{siteContent.motto.author}</span>
      </footer>

      {modalMember ? (
        <MemberModal
          member={modalMember}
          education={modalEducation}
          founderBio={modalBio}
          branchLabel={modalBranch?.displayName ?? null}
          summaryText={modalSummary}
          onClose={() => setModalMember(null)}
          onSubmitUpdate={handleSubmitUpdate}
        />
      ) : null}
    </main>
  );
}
